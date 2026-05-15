import type { AutonomousScopeType, AutonomousWritingRun, CreateAutonomousRunInput } from '@ai-novel/shared'
import { and, asc, desc, eq, isNull, not, or, sql } from 'drizzle-orm'
import { db } from '../db'
import {
  autonomousRunExceptions,
  autonomousRunJobs,
  autonomousWritingRuns,
  chapters,
  writingJobs,
  writingJobSteps,
} from '../db/schema'
import { generateId, now } from '../utils'
import { startJob } from './writing-job.service'

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

  // P2: 实现项目锁，同一时间只能有一个运行中的任务
  const activeRuns = await db.select().from(autonomousWritingRuns).where(and(
    eq(autonomousWritingRuns.projectId, projectId),
    eq(autonomousWritingRuns.status, 'running'),
  ))
  if (activeRuns.length > 0) {
    throw new Error('该项目已有正在进行的自动驾驶任务，请先暂停或完成后再开启新任务。')
  }

  const id = generateId()

  const [run] = await db.insert(autonomousWritingRuns).values({
    id,
    projectId,
    status: 'idle',
    strategy: strategy || 'balanced',
    scopeType,
    volumeId: volumeId || null,
    startChapterId: startChapterId || null,
    endChapterId: endChapterId || null,
    targetChapterCount: targetChapterCount || null,
    targetWordsPerChapter: targetWordsPerChapter || 3000,
    createdAt: now(),
    updatedAt: now(),
  }).returning()

  // Prepare initial chapter jobs based on scope
  await prepareRunJobs(projectId, run.id, scopeType, {
    volumeId,
    startChapterId,
    endChapterId,
    targetChapterCount,
    targetWordsPerChapter: run.targetWordsPerChapter,
  })

  return run as any
}

async function prepareRunJobs(
  projectId: string,
  runId: string,
  scopeType: AutonomousScopeType,
  params: {
    volumeId?: string
    startChapterId?: string
    endChapterId?: string
    targetChapterCount?: number
    targetWordsPerChapter?: number
  },
) {
  let targetChapters: any[] = []

  if (scopeType === 'chapter_range' && params.startChapterId) {
    const startChapter = await db.select({ chapterNumber: chapters.chapterNumber }).from(chapters).where(and(eq(chapters.id, params.startChapterId), eq(chapters.projectId, projectId))).limit(1)
    if (!startChapter[0])
      throw new Error('开始章节不存在')

    let endNumber = 999999
    if (params.endChapterId) {
      const endChapter = await db.select({ chapterNumber: chapters.chapterNumber }).from(chapters).where(and(eq(chapters.id, params.endChapterId), eq(chapters.projectId, projectId))).limit(1)
      if (endChapter[0])
        endNumber = endChapter[0].chapterNumber
    }

    targetChapters = await db.select().from(chapters).where(and(
      eq(chapters.projectId, projectId),
      sql`${chapters.chapterNumber} >= ${startChapter[0].chapterNumber}`,
      sql`${chapters.chapterNumber} <= ${endNumber}`,
    )).orderBy(asc(chapters.chapterNumber))
  }
  else if (scopeType === 'volume' && params.volumeId) {
    targetChapters = await db.select().from(chapters).where(and(
      eq(chapters.projectId, projectId),
      eq(chapters.volumeId, params.volumeId),
    )).orderBy(asc(chapters.chapterNumber))
  }
  else if (scopeType === 'next_n_chapters' && params.targetChapterCount) {
    const minWords = 100
    targetChapters = await db.select().from(chapters).where(and(
      eq(chapters.projectId, projectId),
      or(
        isNull(chapters.draft),
        sql`char_length(coalesce(${chapters.draft}, '')) < ${minWords}`,
      ),
    )).orderBy(asc(chapters.chapterNumber)).limit(params.targetChapterCount)
  }
  else if (scopeType === 'project') {
    const minWords = 100
    targetChapters = await db.select().from(chapters).where(and(
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
    await db.insert(writingJobs).values({
      id: writingJobId,
      projectId,
      currentChapterId: ch.id,
      mode: 'draft_only',
      status: 'idle',
      executionMode: 'auto',
      targetWords: params.targetWordsPerChapter,
      autonomousRunId: runId,
      createdAt: now(),
      updatedAt: now(),
    })

    // Add steps for the writing job (minimal set for draft_only)
    const steps = [
      'prepare_context',
      'generate_draft',
      'build_change_set',
      'review_change_set',
      'apply_change_set',
      'update_health',
      'done',
    ]

    for (let j = 0; j < steps.length; j++) {
      await db.insert(writingJobSteps).values({
        id: generateId(),
        jobId: writingJobId,
        stepType: steps[j] as any,
        status: 'pending',
        createdAt: now(),
        updatedAt: now(),
      })
    }

    // Link to Autonomous Run
    await db.insert(autonomousRunJobs).values({
      id: generateId(),
      runId,
      projectId,
      writingJobId,
      chapterId: ch.id,
      orderIndex: i,
      status: 'pending',
      createdAt: now(),
      updatedAt: now(),
    })
  }
}

export async function getAutonomousRun(projectId: string, runId: string): Promise<any> {
  const [run] = await db.select().from(autonomousWritingRuns).where(and(
    eq(autonomousWritingRuns.id, runId),
    eq(autonomousWritingRuns.projectId, projectId),
  ))

  if (!run)
    return null

  const jobs = await db.select().from(autonomousRunJobs).where(eq(autonomousRunJobs.runId, runId)).orderBy(asc(autonomousRunJobs.orderIndex))

  return { ...run, jobs }
}

export async function getLatestActiveRun(projectId: string): Promise<any> {
  const [run] = await db.select().from(autonomousWritingRuns).where(and(
    eq(autonomousWritingRuns.projectId, projectId),
    or(
      eq(autonomousWritingRuns.status, 'running'),
      eq(autonomousWritingRuns.status, 'needs_attention'),
      eq(autonomousWritingRuns.status, 'paused'),
    ),
  )).orderBy(desc(autonomousWritingRuns.updatedAt)).limit(1)

  if (!run)
    return null

  const jobs = await db.select().from(autonomousRunJobs).where(eq(autonomousRunJobs.runId, run.id)).orderBy(asc(autonomousRunJobs.orderIndex))

  return { ...run, jobs }
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

  // 检查是否有其他正在运行的任务
  const otherRunning = await db.select().from(autonomousWritingRuns).where(and(
    eq(autonomousWritingRuns.projectId, projectId),
    eq(autonomousWritingRuns.status, 'running'),
    not(eq(autonomousWritingRuns.id, runId)),
  ))
  if (otherRunning.length > 0)
    throw new Error('该项目已有其他正在进行的自动驾驶任务')

  await db.update(autonomousWritingRuns).set({
    status: 'running',
    startedAt: now(),
    updatedAt: now(),
  }).where(eq(autonomousWritingRuns.id, runId))

  // P2: 异步启动，防止 API 超时
  runNextAutonomousStep(projectId, runId).catch((err) => {
    console.error(`[AutonomousRun ${runId}] execution failed:`, err)
  })
}

export async function runNextAutonomousStep(projectId: string, runId: string): Promise<void> {
  // Find the first pending job
  const nextJob = await db.select().from(autonomousRunJobs).where(and(
    eq(autonomousRunJobs.runId, runId),
    eq(autonomousRunJobs.status, 'pending'),
  )).orderBy(asc(autonomousRunJobs.orderIndex)).limit(1)

  if (nextJob.length === 0) {
    // All jobs done
    await db.update(autonomousWritingRuns).set({
      status: 'completed',
      finishedAt: now(),
      updatedAt: now(),
    }).where(eq(autonomousWritingRuns.id, runId))
    return
  }

  const jobToRun = nextJob[0]

  // If already running, we might be resuming or it's a retry
  if (jobToRun.status === 'pending') {
    await db.update(autonomousRunJobs).set({
      status: 'running',
      updatedAt: now(),
    }).where(eq(autonomousRunJobs.id, jobToRun.id))
  }

  // Update current chapter pointer in run
  await db.update(autonomousWritingRuns).set({
    currentChapterId: jobToRun.chapterId,
    updatedAt: now(),
  }).where(eq(autonomousWritingRuns.id, runId))

  // Execute the underlying writing job
  // This will run asynchronously or we wait for it?
  // In our engine, runNextSteps (called by startJob) is async but the call itself returns
  await startJob(projectId, jobToRun.writingJobId)
}

export async function pauseAutonomousRun(projectId: string, runId: string, reason?: string): Promise<void> {
  await db.update(autonomousWritingRuns).set({
    status: 'paused',
    pausedReason: reason || 'Manual pause',
    updatedAt: now(),
  }).where(and(
    eq(autonomousWritingRuns.id, runId),
    eq(autonomousWritingRuns.projectId, projectId),
  ))
}

export async function resumeAutonomousRun(projectId: string, runId: string): Promise<void> {
  await db.update(autonomousWritingRuns).set({
    status: 'running',
    pausedReason: null,
    updatedAt: now(),
  }).where(and(
    eq(autonomousWritingRuns.id, runId),
    eq(autonomousWritingRuns.projectId, projectId),
  ))

  await runNextAutonomousStep(projectId, runId)
}

export async function handleAutonomousJobCompletion(
  projectId: string,
  jobId: string,
  status: 'completed' | 'failed' | 'waiting_review',
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
    await db.update(autonomousRunJobs).set({
      status: 'completed',
      updatedAt: now(),
    }).where(and(eq(autonomousRunJobs.runId, runId), eq(autonomousRunJobs.writingJobId, jobId)))

    await db.update(autonomousWritingRuns).set({
      completedChapterCount: sql`${autonomousWritingRuns.completedChapterCount} + 1`,
      updatedAt: now(),
    }).where(eq(autonomousWritingRuns.id, runId))

    // Continue to next
    await runNextAutonomousStep(projectId, runId)
  }
  else if (status === 'failed') {
    await db.update(autonomousRunJobs).set({
      status: 'failed',
      updatedAt: now(),
    }).where(and(eq(autonomousRunJobs.runId, runId), eq(autonomousRunJobs.writingJobId, jobId)))

    await db.update(autonomousWritingRuns).set({
      failedChapterCount: sql`${autonomousWritingRuns.failedChapterCount} + 1`,
      updatedAt: now(),
    }).where(eq(autonomousWritingRuns.id, runId))

    await recordAutonomousException(projectId, runId, {
      exceptionType: 'ai_failed',
      severity: 'high',
      title: 'Writing Job Failed',
      description: reason || 'Unknown error',
      chapterId: job.currentChapterId,
    })

    // If strategy is fast, we might continue anyway?
    if (run.strategy === 'fast') {
      await runNextAutonomousStep(projectId, runId)
    }
    else {
      await db.update(autonomousWritingRuns).set({
        status: 'needs_attention',
        updatedAt: now(),
      }).where(eq(autonomousWritingRuns.id, runId))
    }
  }
  else if (status === 'waiting_review') {
    // Record exception first
    await recordAutonomousException(projectId, runId, {
      exceptionType: 'high_risk_change_set',
      severity: run.strategy === 'fast' ? 'medium' : 'high',
      title: '需要人工审查',
      description: reason || '检测到高风险变更，需要作者确认。',
      chapterId: job.currentChapterId,
    })

    if (run.strategy === 'fast') {
      // Fast strategy: skip this chapter and continue to next
      await db.update(autonomousRunJobs).set({
        status: 'skipped',
        updatedAt: now(),
      }).where(and(eq(autonomousRunJobs.runId, runId), eq(autonomousRunJobs.writingJobId, jobId)))

      await runNextAutonomousStep(projectId, runId)
    }
    else {
      // Safe/Balanced: Mark job as waiting review and pause the run
      await db.update(autonomousRunJobs).set({
        status: 'waiting_review',
        updatedAt: now(),
      }).where(and(eq(autonomousRunJobs.runId, runId), eq(autonomousRunJobs.writingJobId, jobId)))

      await db.update(autonomousWritingRuns).set({
        status: 'needs_attention',
        updatedAt: now(),
      }).where(eq(autonomousWritingRuns.id, runId))
    }
  }
}

export async function recordAutonomousException(
  projectId: string,
  runId: string,
  input: {
    exceptionType: any
    severity: 'medium' | 'high' | 'critical'
    title: string
    description?: string
    chapterId?: string | null
    changeSetId?: string | null
  },
): Promise<void> {
  await db.insert(autonomousRunExceptions).values({
    id: generateId(),
    runId,
    projectId,
    chapterId: input.chapterId || null,
    changeSetId: input.changeSetId || null,
    exceptionType: input.exceptionType,
    severity: input.severity,
    title: input.title,
    description: input.description || null,
    status: 'open',
    createdAt: now(),
    updatedAt: now(),
  })
}

export async function getAutonomousExceptions(projectId: string, runId: string) {
  return db.select().from(autonomousRunExceptions).where(and(
    eq(autonomousRunExceptions.runId, runId),
    eq(autonomousRunExceptions.projectId, projectId),
  )).orderBy(desc(autonomousRunExceptions.createdAt))
}

export async function resolveAutonomousException(projectId: string, runId: string, exceptionId: string, resolution: string) {
  const [ex] = await db.update(autonomousRunExceptions).set({
    status: 'resolved',
    resolution,
    updatedAt: now(),
  }).where(and(
    eq(autonomousRunExceptions.id, exceptionId),
    eq(autonomousRunExceptions.runId, runId),
    eq(autonomousRunExceptions.projectId, projectId),
  )).returning()

  if (!ex)
    throw new Error('未找到该异常记录')

  // 如果该异常对应某个章节任务且该任务处于等待审查状态，将其标记为完成（表示已人工处理/批准）
  if (ex.chapterId) {
    await db.update(autonomousRunJobs).set({
      status: 'completed',
      updatedAt: now(),
    }).where(and(
      eq(autonomousRunJobs.runId, runId),
      eq(autonomousRunJobs.chapterId, ex.chapterId),
      eq(autonomousRunJobs.status, 'waiting_review'),
    ))
  }

  // 尝试恢复运行
  await resumeAutonomousRun(projectId, runId)
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

  await db.update(autonomousRunExceptions).set({
    status: 'ignored',
    updatedAt: now(),
  }).where(eq(autonomousRunExceptions.id, exceptionId))

  // 将对应章节任务标记为跳过
  if (ex.chapterId) {
    await db.update(autonomousRunJobs).set({
      status: 'skipped',
      updatedAt: now(),
    }).where(and(
      eq(autonomousRunJobs.runId, runId),
      eq(autonomousRunJobs.chapterId, ex.chapterId),
      eq(autonomousRunJobs.status, 'waiting_review'),
    ))
  }

  await resumeAutonomousRun(projectId, runId)
}
