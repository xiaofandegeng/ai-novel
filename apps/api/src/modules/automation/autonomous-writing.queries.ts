import { and, asc, desc, eq, inArray, not, or, sql } from 'drizzle-orm'
import { db } from '../../db'
import {
  autonomousRunExceptions,
  autonomousRunJobs,
  autonomousWritingRuns,
  chapterChangeSetItems,
  chapterChangeSets,
  chapterPostprocessSuggestions,
  chapters,
  characterRelationships,
  characters,
  conflicts,
  foreshadowingItems,
  writingJobSteps,
} from '../../db/schema'
import { timestampMs } from '../../shared/utils'
import { getProjectHealthMetrics } from '../narrative/health-metrics.service'

const STEP_LABEL_ZH: Record<string, string> = {
  prepare_context: '构建上下文',
  generate_plan: '生成大纲',
  generate_draft: '生成正文',
  build_change_set: '构建变更集',
  evaluate_change_set: '评估变更集',
  auto_repair: '自动修复',
  apply_change_set: '应用变更集',
  postprocess: '章后管线',
  classify_suggestions: '分类建议',
  apply_suggestions: '应用建议',
  update_health: '更新健康指标',
  done: '任务完成',
}

type RunJobRow = typeof autonomousRunJobs.$inferSelect

async function attachStepSummaries(jobs: RunJobRow[]) {
  const writingJobIds = jobs.map(job => job.writingJobId).filter(Boolean) as string[]
  if (writingJobIds.length === 0)
    return jobs.map(job => ({ ...job, stepSummary: null }))

  const allSteps = await db.select({
    jobId: writingJobSteps.jobId,
    stepType: writingJobSteps.stepType,
    status: writingJobSteps.status,
  }).from(writingJobSteps).where(inArray(writingJobSteps.jobId, writingJobIds))

  const summaries = new Map<string, {
    totalSteps: number
    completedSteps: number
    currentStep: string | null
    currentStepLabel: string | null
  }>()
  for (const step of allSteps) {
    let summary = summaries.get(step.jobId)
    if (!summary) {
      summary = { totalSteps: 0, completedSteps: 0, currentStep: null, currentStepLabel: null }
      summaries.set(step.jobId, summary)
    }
    summary.totalSteps++
    if (step.status === 'completed' || step.status === 'skipped')
      summary.completedSteps++
    if (step.status === 'running') {
      summary.currentStep = step.stepType
      summary.currentStepLabel = STEP_LABEL_ZH[step.stepType] || step.stepType
    }
  }

  return jobs.map(job => ({
    ...job,
    stepSummary: summaries.get(job.writingJobId)
      || { totalSteps: 0, completedSteps: 0, currentStep: null, currentStepLabel: null },
  }))
}

export async function getProjectNarrativeInsight(projectId: string) {
  const health = await getProjectHealthMetrics(projectId)
  const [characterCount] = await db.select({ count: sql`count(*)` }).from(characters).where(eq(characters.projectId, projectId))
  const [relationshipCount] = await db.select({ count: sql`count(*)` }).from(characterRelationships).where(eq(characterRelationships.projectId, projectId))
  const [conflictCount] = await db.select({ count: sql`count(*)` }).from(conflicts).where(and(
    eq(conflicts.projectId, projectId),
    not(eq(conflicts.status, 'resolved')),
  ))
  const [openForeshadowingCount] = await db.select({ count: sql`count(*)` }).from(foreshadowingItems).where(and(
    eq(foreshadowingItems.projectId, projectId),
    or(eq(foreshadowingItems.status, 'open'), eq(foreshadowingItems.status, 'progressing')),
  ))
  const [pendingSuggestionCount] = await db.select({ count: sql`count(*)` }).from(chapterPostprocessSuggestions).where(and(
    eq(chapterPostprocessSuggestions.projectId, projectId),
    eq(chapterPostprocessSuggestions.status, 'pending'),
  ))
  const [appliedSuggestionCount] = await db.select({ count: sql`count(*)` }).from(chapterPostprocessSuggestions).where(and(
    eq(chapterPostprocessSuggestions.projectId, projectId),
    or(
      eq(chapterPostprocessSuggestions.status, 'applied'),
      eq(chapterPostprocessSuggestions.status, 'acknowledged'),
    ),
  ))
  const recentEvents = await db.select().from(chapterChangeSetItems).where(and(
    eq(chapterChangeSetItems.projectId, projectId),
    not(eq(chapterChangeSetItems.itemType, 'draft')),
  )).orderBy(desc(chapterChangeSetItems.createdAt)).limit(10)

  return {
    stats: {
      totalChapters: health.totalChapters,
      completedChapters: health.completedChapters,
      totalWords: health.totalWords,
      characterCount: Number(characterCount?.count || 0),
      relationshipCount: Number(relationshipCount?.count || 0),
      activeConflictCount: Number(conflictCount?.count || health.activeConflicts || 0),
      openForeshadowingCount: Number(openForeshadowingCount?.count || 0),
      pendingSuggestionCount: Number(pendingSuggestionCount?.count || 0),
      appliedSuggestionCount: Number(appliedSuggestionCount?.count || 0),
    },
    radarMetrics: health.radarMetrics,
    recentEvents: recentEvents.map(event => ({
      id: event.id,
      type: event.itemType,
      title: event.title,
      status: event.status,
      createdAt: event.createdAt,
    })),
  }
}

export async function getAutonomousRun(projectId: string, runId: string) {
  const [run] = await db.select().from(autonomousWritingRuns).where(and(
    eq(autonomousWritingRuns.id, runId),
    eq(autonomousWritingRuns.projectId, projectId),
  ))
  if (!run)
    return null

  const jobs = await db.select().from(autonomousRunJobs).where(eq(autonomousRunJobs.runId, runId)).orderBy(asc(autonomousRunJobs.orderIndex))
  return { ...run, jobs: await attachStepSummaries(jobs) }
}

export async function getLatestActiveRun(projectId: string) {
  const [run] = await db.select().from(autonomousWritingRuns).where(and(
    eq(autonomousWritingRuns.projectId, projectId),
    or(
      eq(autonomousWritingRuns.status, 'running'),
      eq(autonomousWritingRuns.status, 'pausing'),
      eq(autonomousWritingRuns.status, 'paused'),
      eq(autonomousWritingRuns.status, 'abandoning'),
      eq(autonomousWritingRuns.status, 'idle'),
    ),
  )).orderBy(desc(autonomousWritingRuns.updatedAt)).limit(1)
  if (!run)
    return null

  const jobs = await db.select().from(autonomousRunJobs).where(eq(autonomousRunJobs.runId, run.id)).orderBy(asc(autonomousRunJobs.orderIndex))
  return { ...run, jobs: await attachStepSummaries(jobs) }
}

export function getAutonomousExceptions(projectId: string, runId: string) {
  return db.select().from(autonomousRunExceptions).where(and(
    eq(autonomousRunExceptions.runId, runId),
    eq(autonomousRunExceptions.projectId, projectId),
  )).orderBy(desc(autonomousRunExceptions.createdAt))
}

export async function getLatestRun(projectId: string) {
  const [run] = await db.select().from(autonomousWritingRuns).where(eq(autonomousWritingRuns.projectId, projectId)).orderBy(desc(autonomousWritingRuns.updatedAt)).limit(1)
  if (!run)
    return null

  const jobs = await db.select().from(autonomousRunJobs).where(eq(autonomousRunJobs.runId, run.id)).orderBy(asc(autonomousRunJobs.orderIndex))
  return { ...run, jobs }
}

export async function getAutonomousRunInsight(projectId: string, runId: string) {
  const [run] = await db.select().from(autonomousWritingRuns).where(and(
    eq(autonomousWritingRuns.id, runId),
    eq(autonomousWritingRuns.projectId, projectId),
  ))
  if (!run)
    throw new Error('未找到自动驾驶记录')

  const jobs = await db.select({
    writingJobId: autonomousRunJobs.writingJobId,
    chapterId: autonomousRunJobs.chapterId,
    status: autonomousRunJobs.status,
  }).from(autonomousRunJobs).where(eq(autonomousRunJobs.runId, runId))
  const jobIds = jobs.map(job => job.writingJobId).filter(Boolean) as string[]

  let changeItems: Array<{
    id: string
    itemType: typeof chapterChangeSetItems.$inferSelect['itemType']
    title: string
    status: typeof chapterChangeSetItems.$inferSelect['status']
    createdAt: string
  }> = []
  if (jobIds.length > 0) {
    changeItems = await db.select({
      id: chapterChangeSetItems.id,
      itemType: chapterChangeSetItems.itemType,
      title: chapterChangeSetItems.title,
      status: chapterChangeSetItems.status,
      createdAt: chapterChangeSetItems.createdAt,
    }).from(chapterChangeSetItems).innerJoin(chapterChangeSets, eq(chapterChangeSetItems.changeSetId, chapterChangeSets.id)).where(inArray(chapterChangeSets.writingJobId, jobIds))
  }

  const countApplied = (type: typeof chapterChangeSetItems.$inferSelect['itemType']) =>
    changeItems.filter(item => item.itemType === type && item.status === 'applied').length
  const [pendingSuggestionCount] = await db.select({ count: sql`count(*)` }).from(chapterPostprocessSuggestions).where(and(
    eq(chapterPostprocessSuggestions.projectId, projectId),
    eq(chapterPostprocessSuggestions.status, 'pending'),
  ))
  const [appliedSuggestionCount] = await db.select({ count: sql`count(*)` }).from(chapterPostprocessSuggestions).where(and(
    eq(chapterPostprocessSuggestions.projectId, projectId),
    or(
      eq(chapterPostprocessSuggestions.status, 'applied'),
      eq(chapterPostprocessSuggestions.status, 'acknowledged'),
    ),
  ))
  const health = await getProjectHealthMetrics(projectId)
  const recentEvents = changeItems
    .filter(item => item.itemType !== 'draft')
    .sort((left, right) => timestampMs(right.createdAt) - timestampMs(left.createdAt))
    .slice(0, 10)
  const completedChapterIds = jobs
    .filter(job => job.status === 'completed')
    .map(job => job.chapterId)
    .filter(Boolean) as string[]
  const completedChaptersData = completedChapterIds.length > 0
    ? await db.select({ draft: chapters.draft }).from(chapters).where(inArray(chapters.id, completedChapterIds))
    : []
  const writtenWords = completedChaptersData.reduce((sum, chapter) => sum + (chapter.draft?.length || 0), 0)
  const pendingSuggestions = Number(pendingSuggestionCount?.count || 0)
  const appliedSuggestions = Number(appliedSuggestionCount?.count || 0)

  return {
    runId: run.id,
    projectId: run.projectId,
    status: run.status,
    stats: { pendingSuggestionCount: pendingSuggestions, appliedSuggestionCount: appliedSuggestions },
    progress: {
      completedChapters: jobs.filter(job => job.status === 'completed').length,
      totalChapters: jobs.length,
      writtenWords,
      targetWords: jobs.length * run.targetWordsPerChapter,
    },
    syncSummary: {
      createdCharacters: countApplied('character_create'),
      updatedCharacters: countApplied('character_update'),
      createdRelationships: countApplied('relationship_create'),
      updatedRelationships: countApplied('relationship_update'),
      createdConflicts: countApplied('conflict_create'),
      updatedConflicts: countApplied('conflict_update'),
      createdForeshadowing: countApplied('foreshadowing_create'),
      paidOffForeshadowing: countApplied('foreshadowing_payoff'),
      createdFacts: countApplied('fact_create'),
      pendingSuggestions,
      appliedSuggestions,
    },
    health: {
      score: health.radarMetrics?.theme
        ? Math.round((
            (health.radarMetrics.theme || 80)
            + (health.radarMetrics.character || 80)
            + (health.radarMetrics.foreshadowing || 80)
            + (health.radarMetrics.conflict || 80)
            + (health.radarMetrics.pacing || 80)
            + (health.radarMetrics.style || 80)
          ) / 6)
        : 85,
      themeRisk: 100 - (health.radarMetrics?.theme || 80),
      characterRisk: 100 - (health.radarMetrics?.character || 80),
      continuityRisk: 100 - (health.radarMetrics?.conflict || 80),
      foreshadowingRisk: 100 - (health.radarMetrics?.foreshadowing || 80),
      rhythmRisk: 100 - (health.radarMetrics?.pacing || 80),
    },
    recentEvents: recentEvents.map(event => ({
      id: event.id,
      type: event.itemType,
      title: event.title,
      status: event.status,
      createdAt: event.createdAt,
    })),
  }
}
