import type { AutonomousExceptionAction, AutonomousScopeType, AutonomousWritingRun, CreateAutonomousRunInput, WritingJobStepType } from '@ai-novel/shared'
import type { AutonomousExceptionSnapshot, AutonomousRunJobSnapshot, AutonomousRunSnapshot } from './autonomous-run.eventing'
import { and, asc, desc, eq, isNull, not, or, sql } from 'drizzle-orm'
import { db } from '../../db'
import {
  autonomousRunExceptions,
  autonomousRunJobs,
  autonomousWritingRuns,
  chapters,
  novelProjects,
  writingJobs,
  writingJobSteps,
} from '../../db/schema'
import { commandBus, wakeEventOutbox } from '../../eventing-runtime'
import { generateId, now, timestampMs } from '../../shared/utils'
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
  REQUEST_AUTONOMOUS_RUN_EXECUTION_COMMAND,
  RESOLVE_AUTONOMOUS_EXCEPTION_ACTION_COMMAND,
} from './autonomous-run.eventing'
import { dispatchWritingJobCommand } from './writing-job.commands'
import {
  CHANGE_WRITING_JOB_COMMAND,
  CREATE_WRITING_JOB_COMMAND,
  REPLACE_WRITING_JOB_STEPS_COMMAND,
} from './writing-job.eventing'

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0]
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

async function requestAutonomousExecution(projectId: string, runId: string, commandId: string): Promise<void> {
  await dispatchAutonomousRunCommand(
    REQUEST_AUTONOMOUS_RUN_EXECUTION_COMMAND,
    projectId,
    runId,
    {},
    { commandId, correlationId: runId, causationId: runId },
  )
  wakeEventOutbox()
}

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
        eq(autonomousWritingRuns.status, 'pausing'),
        eq(autonomousWritingRuns.status, 'paused'),
        eq(autonomousWritingRuns.status, 'abandoning'),
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
        await changeRun(projectId, r.id, { status: 'running', startedAt: now() }, `CleanupStaleRun:${r.id}:start`)
        await changeRun(projectId, r.id, { status: 'abandoning' }, `CleanupStaleRun:${r.id}:request`)
        await changeRun(projectId, r.id, { status: 'abandoned', finishedAt: now() }, `CleanupStaleRun:${r.id}:complete`)
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
      eq(autonomousWritingRuns.status, 'pausing'),
      eq(autonomousWritingRuns.status, 'paused'),
      eq(autonomousWritingRuns.status, 'abandoning'),
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
      await commandBus.runAtomically(async () => {
        await changeRun(projectId, r.id, { status: 'running', startedAt: now() }, `CleanupStaleRun:${r.id}:start`)
        await changeRun(projectId, r.id, { status: 'abandoning' }, `CleanupStaleRun:${r.id}:request`)
        await changeRun(projectId, r.id, { status: 'abandoned', finishedAt: now() }, `CleanupStaleRun:${r.id}:complete`)
      })
    }
  }
  if (trulyActiveOther.length > 0)
    throw new Error('该项目已有其他正在进行或待处理的自动驾驶任务')

  await changeRun(projectId, runId, {
    status: 'running',
    startedAt: now(),
  })

  await requestAutonomousExecution(projectId, runId, `StartRun:${runId}:execute`)
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

  await commandBus.runAtomically(async (tx) => {
    await changeRun(projectId, runId, {
      status: 'pausing',
      pausedReason: reason || 'Manual pause',
    }, `PauseRun:${runId}:request`)
    const activeJobs = await tx.select({ id: writingJobs.id }).from(writingJobs).where(and(
      eq(writingJobs.autonomousRunId, runId),
      eq(writingJobs.status, 'running'),
    ))
    for (const job of activeJobs) {
      await dispatchWritingJobCommand(
        CHANGE_WRITING_JOB_COMMAND,
        projectId,
        job.id,
        { status: 'paused', autoStopReason: reason || 'Manual pause' },
        { commandId: `PauseRun:${runId}:job:${job.id}`, correlationId: runId, causationId: runId },
      )
    }
    await changeRun(projectId, runId, {
      status: 'paused',
      pausedReason: reason || 'Manual pause',
    }, `PauseRun:${runId}:complete`)
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

  const pausedJobs = await db.select({ id: writingJobs.id }).from(writingJobs).where(and(
    eq(writingJobs.autonomousRunId, runId),
    eq(writingJobs.status, 'paused'),
  ))
  await commandBus.runAtomically(async () => {
    await changeRun(projectId, runId, {
      status: 'running',
      pausedReason: null,
    }, `ResumeRun:${runId}:run`)
    for (const job of pausedJobs) {
      await dispatchWritingJobCommand(
        CHANGE_WRITING_JOB_COMMAND,
        projectId,
        job.id,
        { status: 'running', autoStopReason: null },
        { commandId: `ResumeRun:${runId}:job:${job.id}`, correlationId: runId, causationId: runId },
      )
    }
  })

  await requestAutonomousExecution(projectId, runId, `ResumeRun:${runId}:execute:${run.updatedAt}`)
}

export async function abandonAutonomousRun(projectId: string, runId: string): Promise<void> {
  const [run] = await db.select().from(autonomousWritingRuns).where(and(
    eq(autonomousWritingRuns.id, runId),
    eq(autonomousWritingRuns.projectId, projectId),
  ))

  if (!run)
    throw new Error('Run not found')
  if (!['running', 'pausing', 'paused'].includes(run.status))
    throw new Error('只能放弃进行中或暂停的任务')

  await commandBus.runAtomically(async (tx) => {
    await changeRun(projectId, runId, {
      status: 'abandoning',
      pausedReason: '用户请求放弃本轮自动驾驶',
    }, `AbandonRun:${runId}:request`)
    const unfinishedJobs = await tx.select().from(autonomousRunJobs).where(and(
      eq(autonomousRunJobs.runId, runId),
      sql`${autonomousRunJobs.status} NOT IN ('completed', 'skipped', 'isolated')`,
    ))
    for (const unfinishedJob of unfinishedJobs) {
      await changeAutonomousRunJob(
        projectId,
        runId,
        unfinishedJob.id,
        { status: 'skipped' },
        `AbandonRun:${runId}:run-job:${unfinishedJob.id}`,
      )
      await dispatchWritingJobCommand(
        CHANGE_WRITING_JOB_COMMAND,
        projectId,
        unfinishedJob.writingJobId,
        { status: 'paused', autoStopReason: 'Run abandoned' },
        { commandId: `AbandonRun:${runId}:job:${unfinishedJob.writingJobId}`, correlationId: runId, causationId: runId },
      )
    }

    const openExceptions = await tx.select().from(autonomousRunExceptions).where(and(
      eq(autonomousRunExceptions.runId, runId),
      eq(autonomousRunExceptions.status, 'open'),
    ))
    for (const exception of openExceptions)
      await changeException(projectId, runId, exception.id, { status: 'ignored' }, `AbandonRun:${runId}:exception:${exception.id}`)

    await changeRun(projectId, runId, {
      status: 'abandoned',
      pausedReason: '用户放弃本轮自动驾驶',
      finishedAt: now(),
    }, `AbandonRun:${runId}:complete`)
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
  if (!run || run.projectId !== projectId || run.status !== 'running')
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

    await requestAutonomousExecution(projectId, runId, `ContinueRun:${runId}:job:${jobId}`)
  }
  else if (status === 'isolated') {
    // Already updated in writing-job.service.ts or elsewhere, but we can ensure it
    const [runJob] = await db.select().from(autonomousRunJobs).where(and(eq(autonomousRunJobs.runId, runId), eq(autonomousRunJobs.writingJobId, jobId))).limit(1)
    if (runJob)
      await changeAutonomousRunJob(projectId, runId, runJob.id, { status: 'isolated' })

    await requestAutonomousExecution(projectId, runId, `ContinueRun:${runId}:isolated-job:${jobId}`)
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

    // Fast mode skips forward automatically. Safer strategies revoke write
    // authorization and wait for one of the explicit exception actions.
    const [latestRun] = await db.select().from(autonomousWritingRuns).where(eq(autonomousWritingRuns.id, runId))
    if (latestRun && latestRun.status === 'running') {
      if (run.strategy === 'fast') {
        await requestAutonomousExecution(projectId, runId, `ContinueRun:${runId}:failed-job:${jobId}`)
      }
      else {
        await changeRun(projectId, runId, {
          status: 'pausing',
          pausedReason: '章节生成失败，等待作者在异常中心处置',
        }, `PauseForException:${runId}:job:${jobId}:request`)
        await changeRun(projectId, runId, {
          status: 'paused',
          pausedReason: '章节生成失败，等待作者在异常中心处置',
        }, `PauseForException:${runId}:job:${jobId}:complete`)
      }
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

export async function resolveAutonomousExceptionAction(
  projectId: string,
  runId: string,
  exceptionId: string,
  action: AutonomousExceptionAction,
): Promise<void> {
  const [ex] = await db.select().from(autonomousRunExceptions).where(and(
    eq(autonomousRunExceptions.id, exceptionId),
    eq(autonomousRunExceptions.runId, runId),
    eq(autonomousRunExceptions.projectId, projectId),
  )).limit(1)

  if (!ex)
    throw new Error('未找到该异常记录')
  if (ex.status !== 'open')
    throw new Error('该异常已被处理')
  const [run] = await db.select().from(autonomousWritingRuns).where(and(
    eq(autonomousWritingRuns.id, runId),
    eq(autonomousWritingRuns.projectId, projectId),
  )).limit(1)
  if (!run || !['running', 'paused'].includes(run.status))
    throw new Error('只有运行中或已暂停的任务可以处理异常')

  let shouldContinue = false
  await commandBus.runAtomically(async () => {
    await dispatchAutonomousRunCommand(
      RESOLVE_AUTONOMOUS_EXCEPTION_ACTION_COMMAND,
      projectId,
      runId,
      { id: exceptionId, action, resolution: exceptionResolution(action) },
      { commandId: `ResolveExceptionAction:${exceptionId}:${action}`, correlationId: runId, causationId: exceptionId },
    )

    if (action === 'stop_run') {
      await abandonAutonomousRun(projectId, runId)
      return
    }

    const [runJob] = ex.writingJobId
      ? await db.select().from(autonomousRunJobs).where(and(
          eq(autonomousRunJobs.runId, runId),
          eq(autonomousRunJobs.writingJobId, ex.writingJobId),
        )).limit(1)
      : ex.chapterId
        ? await db.select().from(autonomousRunJobs).where(and(
            eq(autonomousRunJobs.runId, runId),
            eq(autonomousRunJobs.chapterId, ex.chapterId),
          )).limit(1)
        : []

    if (action === 'retry_step') {
      if (!ex.writingJobId || !runJob)
        throw new Error('该异常缺少可重试的写作任务')
      const steps = await db.select({ id: writingJobSteps.id, stepType: writingJobSteps.stepType })
        .from(writingJobSteps)
        .where(eq(writingJobSteps.jobId, ex.writingJobId))
      await dispatchWritingJobCommand(REPLACE_WRITING_JOB_STEPS_COMMAND, projectId, ex.writingJobId, {
        steps: steps.map(step => ({ id: step.id, stepType: step.stepType })),
      }, { commandId: `ResolveExceptionAction:${exceptionId}:reset-steps`, correlationId: runId, causationId: exceptionId })
      await dispatchWritingJobCommand(CHANGE_WRITING_JOB_COMMAND, projectId, ex.writingJobId, {
        status: 'idle',
        lastError: null,
      }, { commandId: `ResolveExceptionAction:${exceptionId}:reset-job`, correlationId: runId, causationId: exceptionId })
      await changeAutonomousRunJob(projectId, runId, runJob.id, {
        status: 'pending',
        isolationReason: null,
        isolationReport: null,
      }, `ResolveExceptionAction:${exceptionId}:retry-run-job`)
    }
    else if (runJob) {
      const status = action === 'isolate_chapter' ? 'isolated' : 'skipped'
      await changeAutonomousRunJob(projectId, runId, runJob.id, {
        status,
        isolationReason: action === 'isolate_chapter' ? ex.description || ex.title : null,
        isolationReport: action === 'isolate_chapter' ? { exceptionId, action } : null,
      }, `ResolveExceptionAction:${exceptionId}:${action}:run-job`)
      if (ex.writingJobId) {
        await dispatchWritingJobCommand(CHANGE_WRITING_JOB_COMMAND, projectId, ex.writingJobId, {
          status: 'isolated',
          autoStopReason: exceptionResolution(action),
        }, { commandId: `ResolveExceptionAction:${exceptionId}:${action}:job`, correlationId: runId, causationId: exceptionId })
      }
    }

    if (run.status === 'paused')
      await changeRun(projectId, runId, { status: 'running', pausedReason: null }, `ResolveExceptionAction:${exceptionId}:resume-run`)
    shouldContinue = true
  })

  if (shouldContinue)
    await requestAutonomousExecution(projectId, runId, `ResolveExceptionAction:${exceptionId}:${action}:execute`)
}

function exceptionResolution(action: AutonomousExceptionAction): string {
  const labels: Record<AutonomousExceptionAction, string> = {
    retry_step: '作者要求重试当前步骤',
    skip_chapter: '作者决定跳过本章节',
    isolate_chapter: '作者决定隔离本章节及其未应用内容',
    stop_run: '作者决定终止本轮自动写作',
  }
  return labels[action]
}
