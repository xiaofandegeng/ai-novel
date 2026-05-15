import type { AutonomousScopeType, AutonomousWritingRun, CreateAutonomousRunInput } from '@ai-novel/shared'
import { and, asc, desc, eq, sql } from 'drizzle-orm'
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
  await prepareRunJobs(projectId, run.id, scopeType, { volumeId, startChapterId, endChapterId, targetChapterCount })

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
  },
) {
  // Logic to identify chapters in scope and create pending autonomousRunJobs
  let targetChapters: any[] = []

  if (scopeType === 'chapter_range' && params.startChapterId) {
    // Basic range logic — in a real app this might need to follow novel order
    // For now, let's just pick those specific chapters if they exist
    const q = db.select().from(chapters).where(and(
      eq(chapters.projectId, projectId),
      sql`${chapters.id} >= ${params.startChapterId}`,
      params.endChapterId ? sql`${chapters.id} <= ${params.endChapterId}` : sql`TRUE`,
    )).orderBy(asc(chapters.chapterNumber))

    targetChapters = await q
  }
  else if (scopeType === 'volume' && params.volumeId) {
    targetChapters = await db.select().from(chapters).where(and(
      eq(chapters.projectId, projectId),
      eq(chapters.volumeId, params.volumeId),
    )).orderBy(asc(chapters.chapterNumber))
  }
  else if (scopeType === 'next_n_chapters' && params.targetChapterCount) {
    // Find last completed chapter and take next N
    const lastChapter = await db.select().from(chapters).where(eq(chapters.projectId, projectId)).orderBy(desc(chapters.chapterNumber)).limit(1)

    const lastOrder = lastChapter[0]?.chapterNumber || 0
    targetChapters = await db.select().from(chapters).where(and(
      eq(chapters.projectId, projectId),
      sql`${chapters.chapterNumber} > ${lastOrder}`,
    )).orderBy(asc(chapters.chapterNumber)).limit(params.targetChapterCount)
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

export async function startAutonomousRun(projectId: string, runId: string): Promise<void> {
  const [run] = await db.select().from(autonomousWritingRuns).where(and(
    eq(autonomousWritingRuns.id, runId),
    eq(autonomousWritingRuns.projectId, projectId),
  ))

  if (!run)
    throw new Error('Run not found')
  if (run.status === 'running')
    return

  await db.update(autonomousWritingRuns).set({
    status: 'running',
    startedAt: now(),
    updatedAt: now(),
  }).where(eq(autonomousWritingRuns.id, runId))

  // Kick off the first job
  await runNextAutonomousStep(projectId, runId)
}

export async function runNextAutonomousStep(projectId: string, runId: string): Promise<void> {
  // Find the first pending or running job
  const nextJob = await db.select().from(autonomousRunJobs).where(and(
    eq(autonomousRunJobs.runId, runId),
    sql`${autonomousRunJobs.status} IN ('pending', 'running')`,
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
    // This happens when high risk or blocked
    await recordAutonomousException(projectId, runId, {
      exceptionType: 'high_risk_change_set',
      severity: run.strategy === 'fast' ? 'medium' : 'high',
      title: 'Review Required',
      description: reason || 'Manual confirmation needed due to risk level',
      chapterId: job.currentChapterId,
    })

    if (run.strategy === 'fast') {
      // Skip this chapter and continue? Or wait?
      // Usually "fast" means we continue next ones if possible
      await runNextAutonomousStep(projectId, runId)
    }
    else {
      await db.update(autonomousWritingRuns).set({
        status: 'paused',
        pausedReason: 'Waiting for manual review',
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
