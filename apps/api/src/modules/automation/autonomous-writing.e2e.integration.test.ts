import process from 'node:process'
import { asc, eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'
import { db, sql } from '../../db'
import {
  autonomousRunJobs,
  autonomousWritingRuns,
  chapterChangeSets,
  chapterMemories,
  chapterPostprocessRuns,
  chapterPostprocessSuggestions,
  chapters,
  projectHealthReports,
  storyFactTriples,
  writingJobs,
  writingJobSteps,
} from '../../db/schema'
import { ProjectionReplay } from '../../eventing'
import { eventStore, projectionRegistry } from '../../eventing-runtime'
import { resetTestDatabase } from '../../test/database'
import { createProject } from '../project/projects.service'
import { createAutonomousRun, startAutonomousRun } from './autonomous-writing.service'

const originalFakeMode = process.env.AI_FAKE_MODE

afterEach(() => {
  process.env.AI_FAKE_MODE = originalFakeMode
})
afterAll(() => sql.end())

describe('deterministic autonomous writing workflow', () => {
  beforeEach(async () => {
    await resetTestDatabase()
    process.env.AI_FAKE_MODE = 'true'
  })

  it('creates and writes three chapters through approved change sets and survives full replay', async () => {
    const project = await createProject({ title: '雾港档案', status: 'planning' }, { commandId: 'e2e-project' })
    const run = await createAutonomousRun(project.id, {
      scopeType: 'next_n_chapters',
      strategy: 'balanced',
      targetChapterCount: 3,
      targetWordsPerChapter: 1200,
    })

    await startAutonomousRun(project.id, run.id)
    await waitForRun(project.id, run.id, 'completed')

    const beforeReplay = await workflowProjectionSummary(project.id, run.id)
    expect(beforeReplay.run).toMatchObject({ status: 'completed', completedChapterCount: 3, failedChapterCount: 0 })
    expect(beforeReplay.chapters).toHaveLength(3)
    expect(beforeReplay.chapters.every(chapter => chapter.draft?.includes('潮汐印记'))).toBe(true)
    expect(beforeReplay.runJobs).toHaveLength(3)
    expect(beforeReplay.runJobs.every(job => job.status === 'completed')).toBe(true)
    expect(beforeReplay.writingJobs.every(job => job.status === 'completed')).toBe(true)
    expect(beforeReplay.changeSets).toHaveLength(3)
    expect(beforeReplay.changeSets.every(changeSet => changeSet.status === 'applied')).toBe(true)
    expect(beforeReplay.memories).toHaveLength(3)
    expect(beforeReplay.postprocessRuns).toHaveLength(3)
    expect(beforeReplay.postprocessRuns.every(postprocessRun => postprocessRun.status === 'completed')).toBe(true)
    expect(beforeReplay.suggestions).toHaveLength(6)
    expect(beforeReplay.suggestions.every(suggestion => suggestion.autonomousRunId === run.id)).toBe(true)
    expect(beforeReplay.suggestions.every(suggestion => suggestion.writingJobId)).toBe(true)
    const factSuggestions = beforeReplay.suggestions.filter(suggestion => suggestion.suggestionType === 'fact_triple')
    const reviewSuggestions = beforeReplay.suggestions.filter(suggestion => suggestion.suggestionType === 'chapter_element')
    expect(factSuggestions).toHaveLength(3)
    expect(factSuggestions.every(suggestion => suggestion.status === 'applied' || suggestion.status === 'acknowledged')).toBe(true)
    expect(reviewSuggestions).toHaveLength(3)
    expect(reviewSuggestions.every(suggestion => suggestion.status === 'pending')).toBe(true)
    expect(beforeReplay.facts).toHaveLength(1)
    expect(beforeReplay.healthReports.length).toBeGreaterThan(0)

    await new ProjectionReplay(projectionRegistry, eventStore).replayAll()

    await expect(workflowProjectionSummary(project.id, run.id)).resolves.toEqual(beforeReplay)
  }, 30_000)
})

async function waitForRun(projectId: string, runId: string, expectedStatus: string): Promise<void> {
  const deadline = Date.now() + 20_000
  while (Date.now() < deadline) {
    const [run] = await db.select().from(autonomousWritingRuns).where(eq(autonomousWritingRuns.id, runId))
    if (run?.projectId === projectId && run.status === expectedStatus)
      return
    if (run && ['failed', 'abandoned'].includes(run.status))
      throw new Error(`Autonomous run ended in ${run.status}: ${run.lastError || 'unknown error'}`)
    await new Promise(resolve => setTimeout(resolve, 25))
  }
  throw new Error(`Timed out waiting for autonomous run ${runId} to reach ${expectedStatus}`)
}

async function workflowProjectionSummary(projectId: string, runId: string) {
  const [run] = await db.select().from(autonomousWritingRuns).where(eq(autonomousWritingRuns.id, runId))
  return {
    run,
    chapters: await db.select().from(chapters).where(eq(chapters.projectId, projectId)).orderBy(asc(chapters.chapterNumber)),
    runJobs: await db.select().from(autonomousRunJobs).where(eq(autonomousRunJobs.runId, runId)).orderBy(asc(autonomousRunJobs.orderIndex)),
    writingJobs: await db.select().from(writingJobs).where(eq(writingJobs.autonomousRunId, runId)).orderBy(asc(writingJobs.createdAt), asc(writingJobs.id)),
    writingJobSteps: await db.select().from(writingJobSteps).orderBy(asc(writingJobSteps.createdAt), asc(writingJobSteps.id)),
    changeSets: await db.select().from(chapterChangeSets).where(eq(chapterChangeSets.projectId, projectId)).orderBy(asc(chapterChangeSets.createdAt), asc(chapterChangeSets.id)),
    memories: await db.select().from(chapterMemories).where(eq(chapterMemories.projectId, projectId)).orderBy(asc(chapterMemories.chapterId)),
    postprocessRuns: await db.select().from(chapterPostprocessRuns).where(eq(chapterPostprocessRuns.projectId, projectId)).orderBy(asc(chapterPostprocessRuns.createdAt), asc(chapterPostprocessRuns.id)),
    suggestions: await db.select().from(chapterPostprocessSuggestions).where(eq(chapterPostprocessSuggestions.projectId, projectId)).orderBy(asc(chapterPostprocessSuggestions.createdAt), asc(chapterPostprocessSuggestions.id)),
    facts: await db.select().from(storyFactTriples).where(eq(storyFactTriples.projectId, projectId)).orderBy(asc(storyFactTriples.createdAt), asc(storyFactTriples.id)),
    healthReports: await db.select().from(projectHealthReports).where(eq(projectHealthReports.projectId, projectId)).orderBy(asc(projectHealthReports.generatedAt), asc(projectHealthReports.id)),
  }
}
