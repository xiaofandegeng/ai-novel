import type { AutonomousScopeType, AutonomousWritingRun, CreateAutonomousRunInput } from '@ai-novel/shared'
import { and, asc, desc, eq, isNull, not, or, sql } from 'drizzle-orm'
import { db } from '../db'
import {
  autonomousRunExceptions,
  autonomousRunJobs,
  autonomousWritingRuns,
  chapterChangeSetItems,
  chapterPostprocessSuggestions,
  chapters,
  characterRelationships,
  characters,
  conflicts,
  foreshadowingItems,
  writingJobs,
  writingJobSteps,
} from '../db/schema'
import { generateId, now } from '../utils'
import { getProjectHealthMetrics } from './health-metrics.service'
import { startJob } from './writing-job.service'

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

  return await db.transaction(async (tx) => {
    // P2: 实现项目锁，同一时间只能有一个运行中的任务
    const activeRuns = await tx.select().from(autonomousWritingRuns).where(and(
      eq(autonomousWritingRuns.projectId, projectId),
      or(
        eq(autonomousWritingRuns.status, 'running'),
        eq(autonomousWritingRuns.status, 'paused'),
      ),
    ))
    if (activeRuns.length > 0) {
      throw new Error('该项目已有正在进行或待处理的自动驾驶任务，请先暂停或完成后再开启新任务。')
    }

    const id = generateId()

    const [run] = await tx.insert(autonomousWritingRuns).values({
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
    await prepareRunJobs(tx, projectId, run.id, scopeType, {
      strategy: run.strategy,
      volumeId,
      startChapterId,
      endChapterId,
      targetChapterCount,
      targetWordsPerChapter: run.targetWordsPerChapter,
    })

    return run as any
  })
}

async function prepareRunJobs(
  tx: any,
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
  let targetChapters: any[] = []

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
    await tx.insert(writingJobs).values({
      id: writingJobId,
      projectId,
      currentChapterId: ch.id,
      mode: 'draft_only',
      status: 'idle',
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
      'evaluate_change_set',
      'auto_repair',
      'apply_change_set',
      'postprocess',
      'classify_suggestions',
      'apply_suggestions',
      'update_health',
      'done',
    ]

    for (let j = 0; j < steps.length; j++) {
      await tx.insert(writingJobSteps).values({
        id: generateId(),
        jobId: writingJobId,
        stepType: steps[j] as any,
        status: 'pending',
        createdAt: now(),
        updatedAt: now(),
      })
    }

    // Link to Autonomous Run
    await tx.insert(autonomousRunJobs).values({
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

  // 检查是否有其他活跃的自动驾驶任务
  const otherActive = await db.select().from(autonomousWritingRuns).where(and(
    eq(autonomousWritingRuns.projectId, projectId),
    or(
      eq(autonomousWritingRuns.status, 'running'),
      eq(autonomousWritingRuns.status, 'paused'),
    ),
    not(eq(autonomousWritingRuns.id, runId)),
  ))
  if (otherActive.length > 0)
    throw new Error('该项目已有其他正在进行或待处理的自动驾驶任务')

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
    // Before marking completed, check for blocking states
    const hasBlockers = await hasActiveBlockers(runId)
    if (hasBlockers) {
      // There are still running jobs or open exceptions
      // Don't mark completed - the run will be continued when blockers resolve
      return
    }

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
  const [run] = await db.select().from(autonomousWritingRuns).where(and(
    eq(autonomousWritingRuns.id, runId),
    eq(autonomousWritingRuns.projectId, projectId),
  ))

  if (!run)
    throw new Error('Run not found')
  if (run.status !== 'running')
    throw new Error('只有正在运行的任务才能暂停')

  await db.update(autonomousWritingRuns).set({
    status: 'paused',
    pausedReason: reason || 'Manual pause',
    updatedAt: now(),
  }).where(eq(autonomousWritingRuns.id, runId))
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

  await db.update(autonomousWritingRuns).set({
    status: 'running',
    pausedReason: null,
    updatedAt: now(),
  }).where(eq(autonomousWritingRuns.id, runId))

  await runNextAutonomousStep(projectId, runId)
}

async function hasActiveBlockers(runId: string): Promise<boolean> {
  const [runningJob] = await db.select({ id: autonomousRunJobs.id }).from(autonomousRunJobs).where(and(
    eq(autonomousRunJobs.runId, runId),
    eq(autonomousRunJobs.status, 'running'),
  )).limit(1)
  if (runningJob)
    return true

  const [openException] = await db.select({ id: autonomousRunExceptions.id }).from(autonomousRunExceptions).where(and(
    eq(autonomousRunExceptions.runId, runId),
    eq(autonomousRunExceptions.status, 'open'),
  )).limit(1)
  if (openException)
    return true

  return false
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
    await db.update(autonomousRunJobs).set({
      status: 'completed',
      updatedAt: now(),
    }).where(and(eq(autonomousRunJobs.runId, runId), eq(autonomousRunJobs.writingJobId, jobId)))

    await db.update(autonomousWritingRuns).set({
      completedChapterCount: sql`${autonomousWritingRuns.completedChapterCount} + 1`,
      updatedAt: now(),
    }).where(eq(autonomousWritingRuns.id, runId))

    // Re-read run status before continuing — pause may have been requested
    const [latestRun] = await db.select().from(autonomousWritingRuns).where(eq(autonomousWritingRuns.id, runId))
    if (!latestRun || latestRun.status !== 'running')
      return

    // Continue to next
    await runNextAutonomousStep(projectId, runId)
  }
  else if (status === 'isolated') {
    // Already updated in writing-job.service.ts or elsewhere, but we can ensure it
    await db.update(autonomousRunJobs).set({
      status: 'isolated',
      updatedAt: now(),
    }).where(and(eq(autonomousRunJobs.runId, runId), eq(autonomousRunJobs.writingJobId, jobId)))

    // Continue to next immediately
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
    exceptionType: any
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
): Promise<void> {
  await db.insert(autonomousRunExceptions).values({
    id: generateId(),
    runId,
    projectId,
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
  const [ex] = await db.select().from(autonomousRunExceptions).where(and(
    eq(autonomousRunExceptions.id, exceptionId),
    eq(autonomousRunExceptions.runId, runId),
    eq(autonomousRunExceptions.projectId, projectId),
  )).limit(1)

  if (!ex)
    throw new Error('未找到该异常记录')
  if (ex.status !== 'open')
    throw new Error('该异常已被处理')

  // Mark exception as resolved
  await db.update(autonomousRunExceptions).set({
    status: 'resolved',
    resolution,
    updatedAt: now(),
  }).where(eq(autonomousRunExceptions.id, exceptionId))

  try {
    // Reset the failed/isolated job so it can be re-run
    if (ex.writingJobId) {
      // Reset job steps to pending so startJob re-initializes them
      await db.update(writingJobSteps).set({
        status: 'pending',
        error: null,
        output: null,
        finishedAt: null,
        autoDecision: null,
        autoDecisionReason: null,
        autoDecisionReport: null,
        updatedAt: now(),
      }).where(eq(writingJobSteps.jobId, ex.writingJobId))

      // Reset job status
      await db.update(writingJobs).set({
        status: 'idle',
        lastError: null,
        updatedAt: now(),
      }).where(eq(writingJobs.id, ex.writingJobId))

      // Reset run job status
      await db.update(autonomousRunJobs).set({
        status: 'pending',
        isolationReason: null,
        isolationReport: null,
        updatedAt: now(),
      }).where(and(
        eq(autonomousRunJobs.runId, runId),
        eq(autonomousRunJobs.writingJobId, ex.writingJobId),
      ))
    }
    else if (ex.chapterId) {
      // Legacy: mark chapter job as completed and continue
      await db.update(autonomousRunJobs).set({
        status: 'completed',
        updatedAt: now(),
      }).where(and(
        eq(autonomousRunJobs.runId, runId),
        eq(autonomousRunJobs.chapterId, ex.chapterId),
        or(eq(autonomousRunJobs.status, 'failed'), eq(autonomousRunJobs.status, 'isolated')),
      ))
    }

    // Set run to running and continue
    await db.update(autonomousWritingRuns).set({
      status: 'running',
      updatedAt: now(),
    }).where(eq(autonomousWritingRuns.id, runId))

    await runNextAutonomousStep(projectId, runId)
  }
  catch (err: any) {
    // Revert run to failed on error
    await db.update(autonomousWritingRuns).set({
      status: 'failed',
      lastError: err.message || '异常恢复失败',
      updatedAt: now(),
    }).where(eq(autonomousWritingRuns.id, runId))
    throw err
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
      or(
        eq(autonomousRunJobs.status, 'failed'),
        eq(autonomousRunJobs.status, 'isolated'),
      ),
    ))
  }

  // Check if there are still open exceptions before continuing
  const remainingOpen = await db.select({ id: autonomousRunExceptions.id }).from(autonomousRunExceptions).where(and(
    eq(autonomousRunExceptions.runId, runId),
    eq(autonomousRunExceptions.status, 'open'),
  )).limit(1)

  if (remainingOpen.length === 0) {
    // No more open exceptions — transition to running and continue
    await db.update(autonomousWritingRuns).set({
      status: 'running',
      updatedAt: now(),
    }).where(eq(autonomousWritingRuns.id, runId))

    await runNextAutonomousStep(projectId, runId)
  }
}
