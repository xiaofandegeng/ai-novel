import type { AutonomousScopeType, AutonomousWritingRun, CreateAutonomousRunInput, WritingJobStepType } from '@ai-novel/shared'
import type { AutonomousExceptionSnapshot, AutonomousRunJobSnapshot, AutonomousRunSnapshot } from './autonomous-run.eventing'
import { and, asc, desc, eq, inArray, isNull, not, or, sql } from 'drizzle-orm'
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
  novelProjects,
  writingJobs,
  writingJobSteps,
} from '../../db/schema'
import { commandBus } from '../../eventing-runtime'
import { errorMessage, generateId, now, timestampMs } from '../../shared/utils'
import { getProjectHealthMetrics } from '../narrative/health-metrics.service'
import { dispatchChapterCommand } from '../story/chapter.commands'
import { CREATE_CHAPTER_COMMAND } from '../story/chapter.eventing'
import { compactAutonomousRunPayload, dispatchAutonomousRunCommand } from './autonomous-run.commands'
import {
  ADD_AUTONOMOUS_RUN_JOB_COMMAND,

  CHANGE_AUTONOMOUS_EXCEPTION_COMMAND,
  CHANGE_AUTONOMOUS_RUN_COMMAND,
  CHANGE_AUTONOMOUS_RUN_JOB_COMMAND,
  OPEN_AUTONOMOUS_EXCEPTION_COMMAND,
  PREPARE_AUTONOMOUS_RUN_COMMAND,
} from './autonomous-run.eventing'
import { dispatchWritingJobCommand } from './writing-job.commands'
import {
  CHANGE_WRITING_JOB_COMMAND,
  CREATE_WRITING_JOB_COMMAND,
  REPLACE_WRITING_JOB_STEPS_COMMAND,
} from './writing-job.eventing'

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

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0]
type RunJobRow = typeof autonomousRunJobs.$inferSelect
type ChapterRow = typeof chapters.$inferSelect
type ExceptionType = typeof autonomousRunExceptions.$inferInsert['exceptionType']

export async function changeAutonomousRun(
  projectId: string,
  runId: string,
  fields: Partial<Pick<AutonomousRunSnapshot, 'status' | 'strategy' | 'targetChapterCount' | 'currentChapterId' | 'completedChapterCount' | 'failedChapterCount' | 'pausedReason' | 'lastError' | 'startedAt' | 'finishedAt'>>,
  commandId?: string,
) {
  return dispatchAutonomousRunCommand<AutonomousRunSnapshot>(
    CHANGE_AUTONOMOUS_RUN_COMMAND,
    projectId,
    runId,
    compactAutonomousRunPayload(fields),
    commandId ? { commandId, correlationId: runId, causationId: runId } : {},
  )
}

const changeRun = changeAutonomousRun

export async function changeAutonomousRunJob(
  projectId: string,
  runId: string,
  runJobId: string,
  fields: Partial<Pick<AutonomousRunJobSnapshot, 'status' | 'isolationReason' | 'isolationReport'>>,
  commandId?: string,
) {
  return dispatchAutonomousRunCommand<AutonomousRunJobSnapshot>(
    CHANGE_AUTONOMOUS_RUN_JOB_COMMAND,
    projectId,
    runId,
    compactAutonomousRunPayload({ id: runJobId, ...fields }),
    commandId ? { commandId, correlationId: runId, causationId: runId } : {},
  )
}

async function changeException(
  projectId: string,
  runId: string,
  exceptionId: string,
  fields: Partial<Pick<AutonomousExceptionSnapshot, 'status' | 'autoResolutionStrategy' | 'resolution' | 'resolutionReport'>>,
  commandId?: string,
) {
  return dispatchAutonomousRunCommand<AutonomousExceptionSnapshot>(
    CHANGE_AUTONOMOUS_EXCEPTION_COMMAND,
    projectId,
    runId,
    compactAutonomousRunPayload({ id: exceptionId, ...fields }),
    commandId ? { commandId, correlationId: runId, causationId: exceptionId } : {},
  )
}

async function attachStepSummaries(jobs: RunJobRow[]) {
  const writingJobIds = jobs.map(j => j.writingJobId).filter(Boolean) as string[]
  if (writingJobIds.length === 0) {
    return jobs.map(j => ({ ...j, stepSummary: null }))
  }
  const allSteps = await db.select({
    jobId: writingJobSteps.jobId,
    stepType: writingJobSteps.stepType,
    status: writingJobSteps.status,
  }).from(writingJobSteps).where(inArray(writingJobSteps.jobId, writingJobIds))

  const summaries = new Map<string, { totalSteps: number, completedSteps: number, currentStep: string | null, currentStepLabel: string | null }>()
  for (const step of allSteps) {
    let s = summaries.get(step.jobId)
    if (!s) {
      s = { totalSteps: 0, completedSteps: 0, currentStep: null, currentStepLabel: null }
      summaries.set(step.jobId, s)
    }
    s.totalSteps++
    if (step.status === 'completed' || step.status === 'skipped')
      s.completedSteps++
    if (step.status === 'running') {
      s.currentStep = step.stepType
      s.currentStepLabel = STEP_LABEL_ZH[step.stepType] || step.stepType
    }
  }

  return jobs.map(j => ({
    ...j,
    stepSummary: summaries.get(j.writingJobId) || { totalSteps: 0, completedSteps: 0, currentStep: null, currentStepLabel: null },
  }))
}

export async function getProjectNarrativeInsight(projectId: string) {
  const health = await getProjectHealthMetrics(projectId)

  const [charCount] = await db.select({ count: sql`count(*)` }).from(characters).where(eq(characters.projectId, projectId))
  const [relCount] = await db.select({ count: sql`count(*)` }).from(characterRelationships).where(eq(characterRelationships.projectId, projectId))
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

  // Get recent structural changes
  const recentEvents = await db.select()
    .from(chapterChangeSetItems)
    .where(and(
      eq(chapterChangeSetItems.projectId, projectId),
      not(eq(chapterChangeSetItems.itemType, 'draft')),
    ))
    .orderBy(desc(chapterChangeSetItems.createdAt))
    .limit(10)

  return {
    stats: {
      totalChapters: health.totalChapters,
      completedChapters: health.completedChapters,
      totalWords: health.totalWords,
      characterCount: Number(charCount?.count || 0),
      relationshipCount: Number(relCount?.count || 0),
      activeConflictCount: Number(conflictCount?.count || health.activeConflicts || 0),
      openForeshadowingCount: Number(openForeshadowingCount?.count || 0),
      pendingSuggestionCount: Number(pendingSuggestionCount?.count || 0),
      appliedSuggestionCount: Number(appliedSuggestionCount?.count || 0),
    },
    radarMetrics: health.radarMetrics,
    recentEvents: recentEvents.map(ev => ({
      id: ev.id,
      type: ev.itemType,
      title: ev.title,
      status: ev.status,
      createdAt: ev.createdAt,
    })),
  }
}

export async function createAutonomousRun(
  projectId: string,
  input: CreateAutonomousRunInput,
): Promise<AutonomousWritingRun> {
  const {
    strategy,
    scopeType,
    volumeId,
    startChapterId,
    endChapterId,
    targetChapterCount,
    targetWordsPerChapter,
  } = input

  if (scopeType === 'next_n_chapters' && (!Number.isInteger(targetChapterCount) || targetChapterCount! < 1 || targetChapterCount! > 20))
    throw new Error('目标章节数必须是 1 到 20 之间的整数')

  return await commandBus.runAtomically(async (tx) => {
    const projectLock = await tx.select({ id: novelProjects.id }).from(novelProjects).where(eq(novelProjects.id, projectId)).for('update')
    if (!projectLock[0])
      throw new Error('项目不存在')

    const activeRuns = await tx.select().from(autonomousWritingRuns).where(and(
      eq(autonomousWritingRuns.projectId, projectId),
      or(
        eq(autonomousWritingRuns.status, 'running'),
        eq(autonomousWritingRuns.status, 'paused'),
        eq(autonomousWritingRuns.status, 'idle'),
      ),
    ))

    // Auto-cleanup stale idle runs (idle for >10 minutes = never started)
    const STALE_IDLE_MS = 10 * 60 * 1000
    const trulyActive = activeRuns.filter((r) => {
      if (r.status !== 'idle')
        return true
      const created = r.createdAt ? timestampMs(r.createdAt) : 0
      return Date.now() - created < STALE_IDLE_MS
    })

    for (const r of activeRuns) {
      if (r.status === 'idle' && !trulyActive.includes(r)) {
        await changeRun(projectId, r.id, { status: 'abandoned', finishedAt: now() }, `CleanupStaleRun:${r.id}`)
        const staleJobs = await tx.select().from(autonomousRunJobs).where(and(
          eq(autonomousRunJobs.runId, r.id),
          not(eq(autonomousRunJobs.status, 'completed')),
        ))
        for (const staleJob of staleJobs) {
          await changeAutonomousRunJob(projectId, r.id, staleJob.id, { status: 'skipped' }, `CleanupStaleRun:${r.id}:job:${staleJob.id}`)
        }
      }
    }

    if (trulyActive.length > 0) {
      throw new Error('该项目已有正在进行或待处理的自动驾驶任务，请先暂停或完成后再开启新任务。')
    }

    const id = generateId()

    let run = await dispatchAutonomousRunCommand<AutonomousRunSnapshot>(
      PREPARE_AUTONOMOUS_RUN_COMMAND,
      projectId,
      id,
      compactAutonomousRunPayload({
        strategy: strategy || 'balanced',
        scopeType,
        volumeId: volumeId || null,
        startChapterId: startChapterId || null,
        endChapterId: endChapterId || null,
        targetChapterCount: targetChapterCount || null,
        targetWordsPerChapter: targetWordsPerChapter || 3000,
      }),
      { commandId: `PrepareAutonomousRun:${id}`, correlationId: id },
    )

    // Prepare initial chapter jobs based on scope
    const preparedJobCount = await prepareRunJobs(tx, projectId, run.id, scopeType, {
      strategy: run.strategy,
      volumeId,
      startChapterId,
      endChapterId,
      targetChapterCount,
      targetWordsPerChapter: run.targetWordsPerChapter,
    })
    if (run.targetChapterCount !== preparedJobCount) {
      run = await changeRun(projectId, id, { targetChapterCount: preparedJobCount }, `PrepareAutonomousRun:${id}:realized-count`)
    }

    return run
  })
}

async function prepareRunJobs(
  tx: Transaction,
  projectId: string,
  runId: string,
  scopeType: AutonomousScopeType,
  params: {
    strategy: string
    volumeId?: string
    startChapterId?: string
    endChapterId?: string
    targetChapterCount?: number
    targetWordsPerChapter?: number
  },
) {
  const targetWords = params.targetWordsPerChapter || 3000
  let targetChapters: ChapterRow[] = []

  if (scopeType === 'chapter_range' && params.startChapterId) {
    const startChapter = await tx.select({ chapterNumber: chapters.chapterNumber }).from(chapters).where(and(eq(chapters.id, params.startChapterId), eq(chapters.projectId, projectId))).limit(1)
    if (!startChapter[0])
      throw new Error('开始章节不存在')

    let endNumber = 999999
    if (params.endChapterId) {
      const endChapter = await tx.select({ chapterNumber: chapters.chapterNumber }).from(chapters).where(and(eq(chapters.id, params.endChapterId), eq(chapters.projectId, projectId))).limit(1)
      if (endChapter[0])
        endNumber = endChapter[0].chapterNumber
    }

    targetChapters = await tx.select().from(chapters).where(and(
      eq(chapters.projectId, projectId),
      sql`${chapters.chapterNumber} >= ${startChapter[0].chapterNumber}`,
      sql`${chapters.chapterNumber} <= ${endNumber}`,
    )).orderBy(asc(chapters.chapterNumber))
  }
  else if (scopeType === 'volume' && params.volumeId) {
    targetChapters = await tx.select().from(chapters).where(and(
      eq(chapters.projectId, projectId),
      eq(chapters.volumeId, params.volumeId),
    )).orderBy(asc(chapters.chapterNumber))
  }
  else if (scopeType === 'from_current_forward' && params.startChapterId) {
    const startChapter = await tx.select({ chapterNumber: chapters.chapterNumber }).from(chapters).where(and(eq(chapters.id, params.startChapterId), eq(chapters.projectId, projectId))).limit(1)
    if (!startChapter[0])
      throw new Error('开始章节不存在')

    targetChapters = await tx.select().from(chapters).where(and(
      eq(chapters.projectId, projectId),
      sql`${chapters.chapterNumber} >= ${startChapter[0].chapterNumber}`,
      or(
        isNull(chapters.draft),
        sql`char_length(coalesce(${chapters.draft}, '')) < ${targetWords * 0.6}`,
        not(eq(chapters.status, 'completed')),
      ),
    )).orderBy(asc(chapters.chapterNumber))
  }
  else if (scopeType === 'continue_incomplete') {
    const minWords = 500 // Increased from 100 for better "incomplete" detection
    targetChapters = await tx.select().from(chapters).where(and(
      eq(chapters.projectId, projectId),
      or(
        isNull(chapters.draft),
        sql`char_length(coalesce(${chapters.draft}, '')) < ${minWords}`,
      ),
    )).orderBy(asc(chapters.chapterNumber)).limit(20)
  }
  else if (scopeType === 'rewrite_selected' && params.startChapterId) {
    const startChapter = await tx.select({ chapterNumber: chapters.chapterNumber }).from(chapters).where(and(eq(chapters.id, params.startChapterId), eq(chapters.projectId, projectId))).limit(1)
    if (!startChapter[0])
      throw new Error('开始章节不存在')

    let endNumber = startChapter[0].chapterNumber
    if (params.endChapterId) {
      const endChapter = await tx.select({ chapterNumber: chapters.chapterNumber }).from(chapters).where(and(eq(chapters.id, params.endChapterId), eq(chapters.projectId, projectId))).limit(1)
      if (endChapter[0])
        endNumber = endChapter[0].chapterNumber
    }

    targetChapters = await tx.select().from(chapters).where(and(
      eq(chapters.projectId, projectId),
      sql`${chapters.chapterNumber} >= ${startChapter[0].chapterNumber}`,
      sql`${chapters.chapterNumber} <= ${endNumber}`,
    )).orderBy(asc(chapters.chapterNumber))
  }
  else if (scopeType === 'next_n_chapters' && params.targetChapterCount) {
    const minWords = 100
    targetChapters = await tx.select().from(chapters).where(and(
      eq(chapters.projectId, projectId),
      or(
        isNull(chapters.draft),
        sql`char_length(coalesce(${chapters.draft}, '')) < ${minWords}`,
      ),
    )).orderBy(asc(chapters.chapterNumber)).limit(params.targetChapterCount)

    const missingChapterCount = params.targetChapterCount - targetChapters.length
    if (missingChapterCount > 0) {
      const [lastChapter] = await tx.select({
        chapterNumber: sql<number>`coalesce(max(${chapters.chapterNumber}), 0)`,
      }).from(chapters).where(eq(chapters.projectId, projectId))
      const firstChapterNumber = Number(lastChapter?.chapterNumber ?? 0) + 1

      for (let offset = 0; offset < missingChapterCount; offset++) {
        const chapterNumber = firstChapterNumber + offset
        const chapterId = generateId()
        await dispatchChapterCommand(
          CREATE_CHAPTER_COMMAND,
          projectId,
          chapterId,
          { title: `第 ${chapterNumber} 章`, chapterNumber },
          {
            commandId: `PrepareRun:${runId}:placeholder:${chapterNumber}`,
            correlationId: runId,
            causationId: runId,
          },
        )
      }

      targetChapters = await tx.select().from(chapters).where(and(
        eq(chapters.projectId, projectId),
        or(
          isNull(chapters.draft),
          sql`char_length(coalesce(${chapters.draft}, '')) < ${minWords}`,
        ),
      )).orderBy(asc(chapters.chapterNumber)).limit(params.targetChapterCount)
    }
  }
  else if (scopeType === 'project') {
    const minWords = 100
    targetChapters = await tx.select().from(chapters).where(and(
      eq(chapters.projectId, projectId),
      or(
        isNull(chapters.draft),
        sql`char_length(coalesce(${chapters.draft}, '')) < ${minWords}`,
      ),
    )).orderBy(asc(chapters.chapterNumber)).limit(20)
  }

  if (targetChapters.length === 0) {
    throw new Error('没有找到符合条件的待编写章节，请先创建大纲或检查推进范围。')
  }

  // Create jobs for these chapters
  for (let i = 0; i < targetChapters.length; i++) {
    const ch = targetChapters[i]

    // Create a WritingJob first
    const writingJobId = generateId()
    // Add steps for the writing job. Autonomous writing must always plan first,
    // so draft generation cannot consume an empty or stale outline.
    const steps: WritingJobStepType[] = [
      'prepare_context',
      'generate_plan',
      'validate_plan',
      'generate_draft',
      'build_change_set',
      'evaluate_change_set',
      'auto_repair',
      'apply_change_set',
      'postprocess',
      'classify_suggestions',
      'apply_suggestions',
      'update_health',
      'done',
    ]

    await dispatchWritingJobCommand(
      CREATE_WRITING_JOB_COMMAND,
      projectId,
      writingJobId,
      {
        currentChapterId: ch.id,
        mode: 'outline_then_draft',
        status: 'idle',
        targetWords: params.targetWordsPerChapter ?? null,
        autonomousRunId: runId,
        steps: steps.map(stepType => ({ id: generateId(), stepType })),
      },
      {
        commandId: `PrepareRun:${runId}:job:${writingJobId}`,
        correlationId: runId,
        causationId: runId,
      },
    )

    // Link to Autonomous Run
    const runJobId = generateId()
    await dispatchAutonomousRunCommand(
      ADD_AUTONOMOUS_RUN_JOB_COMMAND,
      projectId,
      runId,
      compactAutonomousRunPayload({
        id: runJobId,
        writingJobId,
        chapterId: ch.id,
        orderIndex: i,
        status: 'pending',
      }),
      {
        commandId: `PrepareRun:${runId}:run-job:${runJobId}`,
        correlationId: runId,
        causationId: runId,
      },
    )
  }
  return targetChapters.length
}

export async function getAutonomousRun(projectId: string, runId: string) {
  const [run] = await db.select().from(autonomousWritingRuns).where(and(
    eq(autonomousWritingRuns.id, runId),
    eq(autonomousWritingRuns.projectId, projectId),
  ))

  if (!run)
    return null

  const jobs = await db.select().from(autonomousRunJobs).where(eq(autonomousRunJobs.runId, runId)).orderBy(asc(autonomousRunJobs.orderIndex))
  const jobsWithSteps = await attachStepSummaries(jobs)

  return { ...run, jobs: jobsWithSteps }
}

export async function getLatestActiveRun(projectId: string) {
  const [run] = await db.select().from(autonomousWritingRuns).where(and(
    eq(autonomousWritingRuns.projectId, projectId),
    or(
      eq(autonomousWritingRuns.status, 'running'),
      eq(autonomousWritingRuns.status, 'paused'),
      eq(autonomousWritingRuns.status, 'idle'),
    ),
  )).orderBy(desc(autonomousWritingRuns.updatedAt)).limit(1)

  if (!run)
    return null

  const jobs = await db.select().from(autonomousRunJobs).where(eq(autonomousRunJobs.runId, run.id)).orderBy(asc(autonomousRunJobs.orderIndex))
  const jobsWithSteps = await attachStepSummaries(jobs)

  return { ...run, jobs: jobsWithSteps }
}

export async function startAutonomousRun(projectId: string, runId: string): Promise<void> {
  const [run] = await db.select().from(autonomousWritingRuns).where(and(
    eq(autonomousWritingRuns.id, runId),
    eq(autonomousWritingRuns.projectId, projectId),
  ))

  if (!run)
    throw new Error('Run not found')
  if (run.status === 'running')
    return

  // Auto-cleanup stale idle runs before checking
  const STALE_IDLE_MS = 10 * 60 * 1000
  const otherActive = await db.select().from(autonomousWritingRuns).where(and(
    eq(autonomousWritingRuns.projectId, projectId),
    or(
      eq(autonomousWritingRuns.status, 'running'),
      eq(autonomousWritingRuns.status, 'paused'),
      eq(autonomousWritingRuns.status, 'idle'),
    ),
    not(eq(autonomousWritingRuns.id, runId)),
  ))
  const trulyActiveOther = otherActive.filter((r) => {
    if (r.status !== 'idle')
      return true
    const created = r.createdAt ? timestampMs(r.createdAt) : 0
    return Date.now() - created < STALE_IDLE_MS
  })
  for (const r of otherActive) {
    if (r.status === 'idle' && !trulyActiveOther.includes(r)) {
      await changeRun(projectId, r.id, { status: 'abandoned', finishedAt: now() }, `CleanupStaleRun:${r.id}`)
    }
  }
  if (trulyActiveOther.length > 0)
    throw new Error('该项目已有其他正在进行或待处理的自动驾驶任务')

  await changeRun(projectId, runId, {
    status: 'running',
    startedAt: now(),
  })

  // P2: 异步启动，防止 API 超时
  runNextAutonomousStep(projectId, runId).catch((err) => {
    console.error(`[AutonomousRun ${runId}] execution failed:`, err)
  })
}

export async function runNextAutonomousStep(projectId: string, runId: string): Promise<void> {
  // Guard: only proceed if run is still running
  const [currentRun] = await db.select().from(autonomousWritingRuns).where(
    eq(autonomousWritingRuns.id, runId),
  )
  if (!currentRun || currentRun.status !== 'running')
    return

  // Find the first pending job
  const nextJob = await db.select().from(autonomousRunJobs).where(and(
    eq(autonomousRunJobs.runId, runId),
    eq(autonomousRunJobs.status, 'pending'),
  )).orderBy(asc(autonomousRunJobs.orderIndex)).limit(1)

  if (nextJob.length === 0) {
    // Check if there are still running jobs
    const activeJobs = await db.select({ id: autonomousRunJobs.id }).from(autonomousRunJobs).where(and(
      eq(autonomousRunJobs.runId, runId),
      eq(autonomousRunJobs.status, 'running'),
    )).limit(1)

    if (activeJobs.length > 0) {
      // Still active jobs running, do not finalize yet
      return
    }

    // All jobs finished. Check if there are any failures to decide final status
    const failedJobs = await db.select({ id: autonomousRunJobs.id }).from(autonomousRunJobs).where(and(
      eq(autonomousRunJobs.runId, runId),
      eq(autonomousRunJobs.status, 'failed'),
    )).limit(1)

    const finalStatus = failedJobs.length > 0 ? 'failed' : 'completed'

    await changeRun(projectId, runId, {
      status: finalStatus,
      finishedAt: now(),
    })
    return
  }

  const jobToRun = nextJob[0]

  // If already running, we might be resuming or it's a retry
  if (jobToRun.status === 'pending') {
    await changeAutonomousRunJob(projectId, runId, jobToRun.id, { status: 'running' })
  }

  // Update current chapter pointer in run
  await changeRun(projectId, runId, {
    currentChapterId: jobToRun.chapterId,
  })

  // Execute the underlying writing job
  // This will run asynchronously or we wait for it?
  // In our engine, runNextSteps (called by startJob) is async but the call itself returns
  const { startJob } = await import('./writing-job.service')
  await startJob(projectId, jobToRun.writingJobId)
}

export async function pauseAutonomousRun(projectId: string, runId: string, reason?: string): Promise<void> {
  const [run] = await db.select().from(autonomousWritingRuns).where(and(
    eq(autonomousWritingRuns.id, runId),
    eq(autonomousWritingRuns.projectId, projectId),
  ))

  if (!run)
    throw new Error('Run not found')
  if (run.status !== 'running')
    throw new Error('只有正在运行的任务才能暂停')

  await changeRun(projectId, runId, {
    status: 'paused',
    pausedReason: reason || 'Manual pause',
  })
}

export async function resumeAutonomousRun(projectId: string, runId: string): Promise<void> {
  const [run] = await db.select().from(autonomousWritingRuns).where(and(
    eq(autonomousWritingRuns.id, runId),
    eq(autonomousWritingRuns.projectId, projectId),
  ))

  if (!run)
    throw new Error('Run not found')

  if (run.status !== 'paused')
    throw new Error('只有暂停状态的任务才能继续推进')

  await changeRun(projectId, runId, {
    status: 'running',
    pausedReason: null,
  })

  await runNextAutonomousStep(projectId, runId)
}

export async function abandonAutonomousRun(projectId: string, runId: string): Promise<void> {
  const [run] = await db.select().from(autonomousWritingRuns).where(and(
    eq(autonomousWritingRuns.id, runId),
    eq(autonomousWritingRuns.projectId, projectId),
  ))

  if (!run)
    throw new Error('Run not found')
  if (!['idle', 'running', 'paused'].includes(run.status))
    throw new Error('只能放弃进行中或暂停的任务')

  const unfinishedJobs = await db.select().from(autonomousRunJobs).where(and(
    eq(autonomousRunJobs.runId, runId),
    sql`${autonomousRunJobs.status} NOT IN ('completed', 'skipped', 'isolated')`,
  ))
  for (const unfinishedJob of unfinishedJobs)
    await changeAutonomousRunJob(projectId, runId, unfinishedJob.id, { status: 'skipped' })

  // Mark all open exceptions of this run as ignored on abandon
  const openExceptions = await db.select().from(autonomousRunExceptions).where(and(
    eq(autonomousRunExceptions.runId, runId),
    eq(autonomousRunExceptions.status, 'open'),
  ))
  for (const exception of openExceptions)
    await changeException(projectId, runId, exception.id, { status: 'ignored' })

  await changeRun(projectId, runId, {
    status: 'abandoned',
    pausedReason: '用户放弃本轮自动驾驶',
    finishedAt: now(),
  })
}

export async function handleAutonomousJobCompletion(
  projectId: string,
  jobId: string,
  status: 'completed' | 'failed' | 'isolated',
  reason?: string,
): Promise<void> {
  const [job] = await db.select().from(writingJobs).where(eq(writingJobs.id, jobId))
  if (!job || !job.autonomousRunId)
    return

  const runId = job.autonomousRunId
  const [run] = await db.select().from(autonomousWritingRuns).where(eq(autonomousWritingRuns.id, runId))
  if (!run)
    return

  if (status === 'completed') {
    const [runJob] = await db.select().from(autonomousRunJobs).where(and(eq(autonomousRunJobs.runId, runId), eq(autonomousRunJobs.writingJobId, jobId))).limit(1)
    if (runJob)
      await changeAutonomousRunJob(projectId, runId, runJob.id, { status: 'completed' })

    await changeRun(projectId, runId, { completedChapterCount: run.completedChapterCount + 1 })

    // Re-read run status before continuing — pause may have been requested
    const [latestRun] = await db.select().from(autonomousWritingRuns).where(eq(autonomousWritingRuns.id, runId))
    if (!latestRun || latestRun.status !== 'running')
      return

    // Continue to next
    await runNextAutonomousStep(projectId, runId)
  }
  else if (status === 'isolated') {
    // Already updated in writing-job.service.ts or elsewhere, but we can ensure it
    const [runJob] = await db.select().from(autonomousRunJobs).where(and(eq(autonomousRunJobs.runId, runId), eq(autonomousRunJobs.writingJobId, jobId))).limit(1)
    if (runJob)
      await changeAutonomousRunJob(projectId, runId, runJob.id, { status: 'isolated' })

    // Continue to next immediately
    await runNextAutonomousStep(projectId, runId)
  }
  else if (status === 'failed') {
    const [runJob] = await db.select().from(autonomousRunJobs).where(and(eq(autonomousRunJobs.runId, runId), eq(autonomousRunJobs.writingJobId, jobId))).limit(1)
    if (runJob)
      await changeAutonomousRunJob(projectId, runId, runJob.id, { status: 'failed' })

    await changeRun(projectId, runId, { failedChapterCount: run.failedChapterCount + 1 })

    // Find the failed step
    const [failedStep] = await db.select().from(writingJobSteps).where(and(
      eq(writingJobSteps.jobId, jobId),
      eq(writingJobSteps.status, 'failed'),
    )).orderBy(desc(writingJobSteps.updatedAt)).limit(1)

    await recordAutonomousException(projectId, runId, {
      exceptionType: 'ai_failed',
      severity: 'high',
      title: 'Writing Job Failed',
      description: reason || 'Unknown error',
      chapterId: job.currentChapterId,
      writingJobId: jobId,
      stepId: failedStep?.id,
      status: run.strategy === 'fast' ? 'ignored' : 'open',
      resolution: run.strategy === 'fast' ? '快速策略自动跳过该章节' : null,
    })

    // Single chapter failure never stops the run — continue to next chapter
    const [latestRun] = await db.select().from(autonomousWritingRuns).where(eq(autonomousWritingRuns.id, runId))
    if (latestRun && latestRun.status === 'running') {
      await runNextAutonomousStep(projectId, runId)
    }
  }
}

export async function recordAutonomousException(
  projectId: string,
  runId: string,
  input: {
    exceptionType: ExceptionType
    severity: 'medium' | 'high' | 'critical'
    title: string
    description?: string
    chapterId?: string | null
    changeSetId?: string | null
    writingJobId?: string | null
    stepId?: string | null
    status?: 'open' | 'resolved' | 'ignored'
    resolution?: string | null
  },
  commandId?: string,
): Promise<void> {
  const exceptionId = generateId()
  await dispatchAutonomousRunCommand(
    OPEN_AUTONOMOUS_EXCEPTION_COMMAND,
    projectId,
    runId,
    compactAutonomousRunPayload({
      id: exceptionId,
      chapterId: input.chapterId || null,
      changeSetId: input.changeSetId || null,
      writingJobId: input.writingJobId || null,
      stepId: input.stepId || null,
      exceptionType: input.exceptionType,
      severity: input.severity,
      title: input.title,
      description: input.description || null,
      status: input.status || 'open',
      resolution: input.resolution || null,
    }),
    commandId ? { commandId, correlationId: runId, causationId: input.stepId ?? runId } : {},
  )
}

export async function getAutonomousExceptions(projectId: string, runId: string) {
  return db.select().from(autonomousRunExceptions).where(and(
    eq(autonomousRunExceptions.runId, runId),
    eq(autonomousRunExceptions.projectId, projectId),
  )).orderBy(desc(autonomousRunExceptions.createdAt))
}

export async function resolveAutonomousException(projectId: string, runId: string, exceptionId: string, resolution: string) {
  const [ex] = await db.select().from(autonomousRunExceptions).where(and(
    eq(autonomousRunExceptions.id, exceptionId),
    eq(autonomousRunExceptions.runId, runId),
    eq(autonomousRunExceptions.projectId, projectId),
  )).limit(1)

  if (!ex)
    throw new Error('未找到该异常记录')
  if (ex.status !== 'open')
    throw new Error('该异常已被处理')

  await changeException(projectId, runId, exceptionId, {
    status: 'resolved',
    resolution,
  }, `ResolveException:${exceptionId}`)

  try {
    // Reset the failed/isolated job so it can be re-run
    if (ex.writingJobId) {
      // Reset job steps to pending so startJob re-initializes them
      const jobSteps = await db.select({ id: writingJobSteps.id, stepType: writingJobSteps.stepType })
        .from(writingJobSteps)
        .where(eq(writingJobSteps.jobId, ex.writingJobId))
      await dispatchWritingJobCommand(
        REPLACE_WRITING_JOB_STEPS_COMMAND,
        projectId,
        ex.writingJobId,
        { steps: jobSteps.map(step => ({ id: step.id, stepType: step.stepType })) },
        {
          commandId: `ResolveException:${exceptionId}:reset-steps`,
          correlationId: runId,
          causationId: exceptionId,
        },
      )

      // Reset job status
      await dispatchWritingJobCommand(
        CHANGE_WRITING_JOB_COMMAND,
        projectId,
        ex.writingJobId,
        { status: 'idle', lastError: null },
        {
          commandId: `ResolveException:${exceptionId}:reset-job`,
          correlationId: runId,
          causationId: exceptionId,
        },
      )

      // Reset run job status
      const [runJob] = await db.select().from(autonomousRunJobs).where(and(
        eq(autonomousRunJobs.runId, runId),
        eq(autonomousRunJobs.writingJobId, ex.writingJobId),
      )).limit(1)
      if (runJob) {
        await changeAutonomousRunJob(projectId, runId, runJob.id, {
          status: 'pending',
          isolationReason: null,
          isolationReport: null,
        }, `ResolveException:${exceptionId}:reset-run-job`)
      }
    }
    else if (ex.chapterId) {
      // Legacy: mark chapter job as completed and continue
      const [runJob] = await db.select().from(autonomousRunJobs).where(and(
        eq(autonomousRunJobs.runId, runId),
        eq(autonomousRunJobs.chapterId, ex.chapterId),
        or(eq(autonomousRunJobs.status, 'failed'), eq(autonomousRunJobs.status, 'isolated')),
      )).limit(1)
      if (runJob)
        await changeAutonomousRunJob(projectId, runId, runJob.id, { status: 'completed' }, `ResolveException:${exceptionId}:complete-legacy-job`)
    }

    // Set run to running and continue
    await changeRun(projectId, runId, {
      status: 'running',
    }, `ResolveException:${exceptionId}:resume-run`)

    await runNextAutonomousStep(projectId, runId)
  }
  catch (error: unknown) {
    // Revert run to failed on error
    await changeRun(projectId, runId, {
      status: 'failed',
      lastError: errorMessage(error, '异常恢复失败'),
    })
    throw error
  }
}

export async function ignoreAutonomousException(projectId: string, runId: string, exceptionId: string) {
  const [ex] = await db.select().from(autonomousRunExceptions).where(and(
    eq(autonomousRunExceptions.id, exceptionId),
    eq(autonomousRunExceptions.runId, runId),
    eq(autonomousRunExceptions.projectId, projectId),
  )).limit(1)

  if (!ex)
    throw new Error('未找到该异常记录')
  if (ex.severity === 'critical')
    throw new Error('致命级异常无法直接忽略，请进行处理。')

  await changeException(projectId, runId, exceptionId, { status: 'ignored' }, `IgnoreException:${exceptionId}`)

  // 将对应章节任务标记为跳过
  if (ex.chapterId) {
    const [runJob] = await db.select().from(autonomousRunJobs).where(and(
      eq(autonomousRunJobs.runId, runId),
      eq(autonomousRunJobs.chapterId, ex.chapterId),
      or(
        eq(autonomousRunJobs.status, 'failed'),
        eq(autonomousRunJobs.status, 'isolated'),
      ),
    )).limit(1)
    if (runJob)
      await changeAutonomousRunJob(projectId, runId, runJob.id, { status: 'skipped' }, `IgnoreException:${exceptionId}:skip-job`)
  }

  // Check if there are still open exceptions before continuing
  const remainingOpen = await db.select({ id: autonomousRunExceptions.id }).from(autonomousRunExceptions).where(and(
    eq(autonomousRunExceptions.runId, runId),
    eq(autonomousRunExceptions.status, 'open'),
  )).limit(1)

  if (remainingOpen.length === 0) {
    // No more open exceptions — transition to running and continue
    await changeRun(projectId, runId, {
      status: 'running',
    }, `IgnoreException:${exceptionId}:resume-run`)

    await runNextAutonomousStep(projectId, runId)
  }
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

  // 获取这一轮下的所有 jobs
  const jobs = await db.select({
    writingJobId: autonomousRunJobs.writingJobId,
    chapterId: autonomousRunJobs.chapterId,
    status: autonomousRunJobs.status,
  }).from(autonomousRunJobs).where(eq(autonomousRunJobs.runId, runId))

  const jobIds = jobs.map(j => j.writingJobId).filter(Boolean) as string[]

  let changeItems: Array<{
    id: string
    itemType: typeof chapterChangeSetItems.$inferSelect['itemType']
    title: string
    status: typeof chapterChangeSetItems.$inferSelect['status']
    createdAt: string
  }> = []
  if (jobIds.length > 0) {
    // 找出所有属于本轮 jobs 的 changeset items
    changeItems = await db.select({
      id: chapterChangeSetItems.id,
      itemType: chapterChangeSetItems.itemType,
      title: chapterChangeSetItems.title,
      status: chapterChangeSetItems.status,
      createdAt: chapterChangeSetItems.createdAt,
    })
      .from(chapterChangeSetItems)
      .innerJoin(chapterChangeSets, eq(chapterChangeSetItems.changeSetId, chapterChangeSets.id))
      .where(inArray(chapterChangeSets.writingJobId, jobIds))
  }

  // 聚合计数
  const createdCharacters = changeItems.filter(i => i.itemType === 'character_create' && i.status === 'applied').length
  const updatedCharacters = changeItems.filter(i => i.itemType === 'character_update' && i.status === 'applied').length
  const createdRelationships = changeItems.filter(i => i.itemType === 'relationship_create' && i.status === 'applied').length
  const updatedRelationships = changeItems.filter(i => i.itemType === 'relationship_update' && i.status === 'applied').length
  const createdConflicts = changeItems.filter(i => i.itemType === 'conflict_create' && i.status === 'applied').length
  const updatedConflicts = changeItems.filter(i => i.itemType === 'conflict_update' && i.status === 'applied').length
  const createdForeshadowing = changeItems.filter(i => i.itemType === 'foreshadowing_create' && i.status === 'applied').length
  const paidOffForeshadowing = changeItems.filter(i => i.itemType === 'foreshadowing_payoff' && i.status === 'applied').length
  const createdFacts = changeItems.filter(i => i.itemType === 'fact_create' && i.status === 'applied').length

  // 获取整个项目的建议统计
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

  // 截取前 10 条非草稿的剧情和设定变更事件
  const recentEvents = changeItems
    .filter(i => i.itemType !== 'draft')
    .sort((a, b) => timestampMs(b.createdAt) - timestampMs(a.createdAt))
    .slice(0, 10)

  // 进度统计
  const totalChapters = jobs.length
  const completedChapters = jobs.filter(j => j.status === 'completed').length

  // 真实字数：从已完成章节的 draft 字段统计
  const completedChapterIds = jobs.filter(j => j.status === 'completed').map(j => j.chapterId).filter(Boolean) as string[]
  let writtenWords = 0
  if (completedChapterIds.length > 0) {
    const completedChaptersData = await db.select({ draft: chapters.draft }).from(chapters).where(inArray(chapters.id, completedChapterIds))
    writtenWords = completedChaptersData.reduce((sum, ch) => sum + (ch.draft?.length || 0), 0)
  }
  const targetWords = totalChapters * run.targetWordsPerChapter

  return {
    runId: run.id,
    projectId: run.projectId,
    status: run.status,
    stats: {
      pendingSuggestionCount: Number(pendingSuggestionCount?.count || 0),
      appliedSuggestionCount: Number(appliedSuggestionCount?.count || 0),
    },
    progress: {
      completedChapters,
      totalChapters,
      writtenWords,
      targetWords,
    },
    syncSummary: {
      createdCharacters,
      updatedCharacters,
      createdRelationships,
      updatedRelationships,
      createdConflicts,
      updatedConflicts,
      createdForeshadowing,
      paidOffForeshadowing,
      createdFacts,
      pendingSuggestions: Number(pendingSuggestionCount?.count || 0),
      appliedSuggestions: Number(appliedSuggestionCount?.count || 0),
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
    recentEvents: recentEvents.map(ev => ({
      id: ev.id,
      type: ev.itemType,
      title: ev.title,
      status: ev.status,
      createdAt: ev.createdAt,
    })),
  }
}
