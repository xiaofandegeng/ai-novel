import process from 'node:process'
import { and, eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db, sql } from '../../db'
import {
  autonomousRunJobs,
  chapterMemories,
  chapterPostprocessRuns,
  chapterPostprocessSuggestions,
  chapters,
  chapterStyleFingerprints,
} from '../../db/schema'
import { commandBus, wakeEventOutbox } from '../../eventing-runtime'
import { resetTestDatabase } from '../../test/database'
import { CREATE_PROJECT_COMMAND, PROJECT_AGGREGATE_TYPE } from '../project/project.eventing'
import { CHAPTER_AGGREGATE_TYPE, CREATE_CHAPTER_COMMAND } from '../story/chapter.eventing'
import {
  changeAutonomousRun,
  createAutonomousRun,
  pauseAutonomousRun,
} from './autonomous-writing.service'
import { runChapterPostprocess } from './chapter-postprocess.service'

const aiMocks = vi.hoisted(() => ({
  callAIJSON: vi.fn(),
  getOrCreateEmbedding: vi.fn(),
}))

vi.mock('../ai/ai.service', async (importOriginal) => {
  const original = await importOriginal<typeof import('../ai/ai.service')>()
  return { ...original, callAIJSON: aiMocks.callAIJSON }
})

vi.mock('../ai/embedding.service', () => ({
  getOrCreateEmbedding: aiMocks.getOrCreateEmbedding,
}))

const originalFakeMode = process.env.AI_FAKE_MODE

afterAll(() => sql.end())

describe('chapter postprocess service', () => {
  beforeEach(async () => {
    await resetTestDatabase()
    aiMocks.callAIJSON.mockReset()
    aiMocks.getOrCreateEmbedding.mockReset().mockResolvedValue([])
  })

  afterEach(async () => {
    await wakeEventOutbox()
    process.env.AI_FAKE_MODE = originalFakeMode
  })

  it('records memory, suggestions, style fingerprint, and a completed run', async () => {
    await createProjectAndChapter('project-1', 'chapter-1')
    aiMocks.callAIJSON.mockResolvedValue({
      summary: '林岚收到来信并决定前往雾港。',
      keyEvents: [{ title: '收到来信', description: '线索指向雾港', importance: 'major' }],
      facts: [{
        subjectType: 'character',
        subjectName: '林岚',
        predicate: '决定前往',
        objectType: 'location',
        objectName: '雾港',
        confidence: 95,
        reason: '正文明确描述',
      }],
      foreshadowingAdded: [{ title: '潮汐印记', description: '信封上的印记', importance: 'major', confidence: 80 }],
      foreshadowingPayoffs: [],
      characterStateChanges: [{ characterName: '林岚', change: '从犹豫转为坚定', confidence: 90 }],
      relationshipUpdates: [],
      conflictUpdates: [],
      newCharacters: [],
      newConflicts: [],
      presentCharacters: [],
      styleNotes: [{ title: '短句推进', description: '节奏紧凑', confidence: 75 }],
    })

    const result = await runChapterPostprocess({
      projectId: 'project-1',
      chapterId: 'chapter-1',
      content: '雨水敲打着窗。林岚拆开来信，决定前往雾港寻找真相。',
      trigger: 'manual_save',
    })

    expect(result).toMatchObject({
      warnings: ['检测到新增伏笔，后续章节应注意回收。'],
      conflictUpdates: [],
      memory: { chapterId: 'chapter-1', summary: '林岚收到来信并决定前往雾港。' },
    })
    await expect(db.select().from(chapterMemories)).resolves.toHaveLength(1)
    await expect(db.select({ type: chapterPostprocessSuggestions.suggestionType })
      .from(chapterPostprocessSuggestions))
      .resolves
      .toEqual(expect.arrayContaining([
        { type: 'fact_triple' },
        { type: 'foreshadowing_add' },
        { type: 'character_state' },
        { type: 'chapter_element' },
        { type: 'style_note' },
      ]))
    await expect(db.select().from(chapterStyleFingerprints)).resolves.toHaveLength(1)
    await expect(db.select().from(chapterPostprocessRuns).where(eq(chapterPostprocessRuns.id, result.runId)))
      .resolves
      .toMatchObject([{ status: 'completed', projectId: 'project-1', chapterId: 'chapter-1' }])
    expect(aiMocks.getOrCreateEmbedding).toHaveBeenCalledTimes(2)
  })

  it('records a failed run without creating memory when extraction fails', async () => {
    await createProjectAndChapter('project-1', 'chapter-1')
    aiMocks.callAIJSON.mockRejectedValue(new Error('provider unavailable'))

    await expect(runChapterPostprocess({
      projectId: 'project-1',
      chapterId: 'chapter-1',
      content: '必须保留的作者正文',
      trigger: 'manual_save',
    })).rejects.toThrow('provider unavailable')

    await expect(db.select().from(chapterMemories)).resolves.toHaveLength(0)
    await expect(db.select().from(chapterPostprocessSuggestions)).resolves.toHaveLength(0)
    await expect(db.select().from(chapterPostprocessRuns)).resolves.toMatchObject([{
      status: 'failed',
      errorMessage: 'provider unavailable',
    }])
  })

  it('rejects late AI results after run authorization is paused', async () => {
    await createProject('project-1')
    const run = await createAutonomousRun('project-1', {
      scopeType: 'next_n_chapters',
      strategy: 'balanced',
      targetChapterCount: 1,
    })
    const [chapter] = await db.select().from(chapters).where(eq(chapters.projectId, 'project-1'))
    const [runJob] = await db.select().from(autonomousRunJobs).where(eq(autonomousRunJobs.runId, run.id))
    await changeAutonomousRun('project-1', run.id, { status: 'running' }, 'start-run')
    await pauseAutonomousRun('project-1', run.id, '作者暂停')
    aiMocks.callAIJSON.mockResolvedValue({
      summary: '这份迟到结果不得写回。',
      facts: [{ subjectName: '迟到结果', predicate: '不得', objectName: '写回' }],
    })

    await expect(runChapterPostprocess({
      projectId: 'project-1',
      chapterId: chapter.id,
      content: '迟到的模型结果',
      trigger: 'auto_drive',
      autonomousRunId: run.id,
      writingJobId: runJob.writingJobId,
    })).rejects.toMatchObject({ code: 'AUTONOMOUS_RUN_AUTHORIZATION_REVOKED' })

    await expect(db.select().from(chapterMemories)).resolves.toHaveLength(0)
    await expect(db.select().from(chapterPostprocessSuggestions)).resolves.toHaveLength(0)
    await expect(db.select().from(chapterPostprocessRuns).where(and(
      eq(chapterPostprocessRuns.autonomousRunId, run.id),
      eq(chapterPostprocessRuns.writingJobId, runJob.writingJobId),
    ))).resolves.toMatchObject([{ status: 'failed' }])
  })
})

async function createProjectAndChapter(projectId: string, chapterId: string): Promise<void> {
  await createProject(projectId)
  await commandBus.dispatch({
    commandId: `create:${chapterId}`,
    commandType: CREATE_CHAPTER_COMMAND,
    aggregateType: CHAPTER_AGGREGATE_TYPE,
    aggregateId: chapterId,
    projectId,
    correlationId: `create:${chapterId}`,
    payload: { title: '雾港来信', chapterNumber: 1 },
  })
}

function createProject(projectId: string) {
  return commandBus.dispatch({
    commandId: `create:${projectId}`,
    commandType: CREATE_PROJECT_COMMAND,
    aggregateType: PROJECT_AGGREGATE_TYPE,
    aggregateId: projectId,
    projectId,
    correlationId: `create:${projectId}`,
    payload: { title: '自动化测试' },
  })
}
