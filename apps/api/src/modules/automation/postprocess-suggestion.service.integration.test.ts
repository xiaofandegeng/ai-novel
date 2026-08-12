import { and, eq } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { db, sql } from '../../db'
import { autonomousRunJobs, chapterPostprocessSuggestions, characters, conflicts, domainEvents, storyFactTriples } from '../../db/schema'
import { commandBus } from '../../eventing-runtime'
import { resetTestDatabase } from '../../test/database'
import { CREATE_PROJECT_COMMAND, PROJECT_AGGREGATE_TYPE } from '../project/project.eventing'
import { CHAPTER_AGGREGATE_TYPE, CREATE_CHAPTER_COMMAND } from '../story/chapter.eventing'
import { changeAutonomousRun, createAutonomousRun } from './autonomous-writing.service'
import {
  applyAutoSuggestions,
  applySuggestion,
  createSuggestion,
  rejectSuggestion,
} from './postprocess-suggestion.service'
import { dispatchPostprocessRunCommand } from './postprocess.commands'
import { REQUEST_POSTPROCESS_RUN_COMMAND } from './postprocess.eventing'

afterAll(() => sql.end())

describe('postprocess suggestion event-sourced application', () => {
  beforeEach(async () => {
    await resetTestDatabase()
    await commandBus.dispatch({
      commandId: 'project',
      commandType: CREATE_PROJECT_COMMAND,
      aggregateType: PROJECT_AGGREGATE_TYPE,
      aggregateId: 'project-1',
      projectId: 'project-1',
      correlationId: 'project',
      payload: { title: '自动化测试' },
    })
    await commandBus.dispatch({
      commandId: 'chapter',
      commandType: CREATE_CHAPTER_COMMAND,
      aggregateType: CHAPTER_AGGREGATE_TYPE,
      aggregateId: 'chapter-1',
      projectId: 'project-1',
      correlationId: 'chapter',
      payload: { title: '归港', chapterNumber: 1 },
    })
  })

  it('does not mutate narrative state for rejected suggestions', async () => {
    const suggestion = await createSuggestion('project-1', 'chapter-1', null, 'fact_triple', {
      subjectName: '林岚',
      predicate: '抵达',
      objectName: '雾港',
    })
    await rejectSuggestion('project-1', suggestion.id)

    await expect(applySuggestion('project-1', suggestion.id)).rejects.toThrow('建议已拒绝')
    await expect(db.select().from(storyFactTriples)).resolves.toHaveLength(0)
  })

  it('applies a fact once and returns the completed result on retry', async () => {
    const suggestion = await createSuggestion('project-1', 'chapter-1', null, 'fact_triple', {
      subjectType: 'character',
      subjectName: '林岚',
      predicate: '抵达',
      objectType: 'location',
      objectName: '雾港',
    })

    await expect(applySuggestion('project-1', suggestion.id)).resolves.toMatchObject({ status: 'applied' })
    await expect(applySuggestion('project-1', suggestion.id)).resolves.toMatchObject({ status: 'applied' })
    await expect(db.select().from(storyFactTriples)).resolves.toHaveLength(1)
    await expect(db.select().from(domainEvents).where(
      eq(domainEvents.commandId, `ApplySuggestion:${suggestion.id}`),
    )).resolves.toHaveLength(1)
  })

  it('rolls back all domain commands when a later derived command fails', async () => {
    await commandBus.dispatch({
      commandId: 'conflict',
      commandType: 'CreateConflict',
      aggregateType: 'Conflict',
      aggregateId: 'conflict-1',
      projectId: 'project-1',
      correlationId: 'conflict',
      payload: { title: '航线公开', type: 'external', intensity: 10, status: 'latent' },
    })
    const suggestion = await createSuggestion('project-1', 'chapter-1', null, 'conflict_update', {
      conflictId: 'conflict-1',
      newIntensity: 80,
      newStatus: 'escalating',
      sceneId: 'missing-scene',
    })

    await expect(applySuggestion('project-1', suggestion.id)).rejects.toMatchObject({ code: 'SCENE_NOT_FOUND' })
    const [conflict] = await db.select().from(conflicts).where(eq(conflicts.id, 'conflict-1'))
    expect(conflict).toMatchObject({ intensity: 10, status: 'latent' })
    await expect(db.select().from(domainEvents).where(
      eq(domainEvents.commandId, `ApplySuggestion:${suggestion.id}:conflict:change`),
    )).resolves.toHaveLength(0)
    const [failed] = await db.select().from(chapterPostprocessSuggestions).where(and(
      eq(chapterPostprocessSuggestions.id, suggestion.id),
      eq(chapterPostprocessSuggestions.projectId, 'project-1'),
    ))
    expect(failed.status).toBe('apply_failed')
    await expect(db.select().from(characters)).resolves.toHaveLength(0)
  })

  it('auto-applies only suggestions created by the current autonomous and postprocess run', async () => {
    await dispatchPostprocessRunCommand(REQUEST_POSTPROCESS_RUN_COMMAND, 'project-1', 'postprocess-old', {
      chapterId: 'chapter-1',
      trigger: 'auto_drive',
      autonomousRunId: 'autonomous-old',
      writingJobId: 'job-old',
    })
    const oldSuggestion = await createSuggestion('project-1', 'chapter-1', 'postprocess-old', 'fact_triple', {
      subjectName: '旧批次',
      predicate: '不应写入',
      objectName: '正式事实库',
    }, 95)

    const autonomousRun = await createAutonomousRun('project-1', {
      scopeType: 'next_n_chapters',
      strategy: 'balanced',
      targetChapterCount: 1,
    })
    const [runJob] = await db.select().from(autonomousRunJobs).where(eq(autonomousRunJobs.runId, autonomousRun.id))
    await changeAutonomousRun('project-1', autonomousRun.id, { status: 'running' }, 'start-current-run')
    await dispatchPostprocessRunCommand(REQUEST_POSTPROCESS_RUN_COMMAND, 'project-1', 'postprocess-current', {
      chapterId: 'chapter-1',
      trigger: 'auto_drive',
      autonomousRunId: autonomousRun.id,
      writingJobId: runJob.writingJobId,
    })
    const currentSuggestion = await createSuggestion('project-1', 'chapter-1', 'postprocess-current', 'fact_triple', {
      subjectName: '当前批次',
      predicate: '允许写入',
      objectName: '正式事实库',
    }, 95)
    const highRiskSuggestion = await createSuggestion('project-1', 'chapter-1', 'postprocess-current', 'character_add', {
      name: '未经作者确认的新人物',
      role: 'supporting',
    }, 99)

    await expect(applyAutoSuggestions('project-1', 'chapter-1', 'balanced', {
      autonomousRunId: autonomousRun.id,
      postprocessRunId: 'postprocess-current',
      writingJobId: runJob.writingJobId,
    })).resolves.toMatchObject({ applied: 1, failed: 0 })

    await expect(db.select({ subjectName: storyFactTriples.subjectName }).from(storyFactTriples)).resolves.toEqual([
      { subjectName: '当前批次' },
    ])
    await expect(db.select({ id: chapterPostprocessSuggestions.id, status: chapterPostprocessSuggestions.status })
      .from(chapterPostprocessSuggestions)
      .where(eq(chapterPostprocessSuggestions.id, oldSuggestion.id))).resolves.toEqual([{ id: oldSuggestion.id, status: 'pending' }])
    await expect(db.select({ id: chapterPostprocessSuggestions.id, status: chapterPostprocessSuggestions.status })
      .from(chapterPostprocessSuggestions)
      .where(eq(chapterPostprocessSuggestions.id, currentSuggestion.id))).resolves.toEqual([{ id: currentSuggestion.id, status: 'applied' }])
    await expect(db.select({ id: chapterPostprocessSuggestions.id, status: chapterPostprocessSuggestions.status })
      .from(chapterPostprocessSuggestions)
      .where(eq(chapterPostprocessSuggestions.id, highRiskSuggestion.id))).resolves.toEqual([{ id: highRiskSuggestion.id, status: 'pending' }])
    await expect(db.select().from(characters)).resolves.toHaveLength(0)
  })
})
