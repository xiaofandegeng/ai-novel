import { and, asc, eq } from 'drizzle-orm'
import { db } from '../../db'
import { autonomousRunJobs, autonomousWritingRuns } from '../../db/schema'
import { changeAutonomousRun, changeAutonomousRunJob } from './autonomous-writing.service'

/**
 * Advances one autonomous Run from its current read-model state.
 *
 * The process manager never writes a projection table. It selects the next
 * aggregate transition and submits commands; AI execution remains behind the
 * WritingJob Outbox handler.
 */
export async function advanceAutonomousWritingRun(projectId: string, runId: string): Promise<void> {
  const [currentRun] = await db.select().from(autonomousWritingRuns).where(
    eq(autonomousWritingRuns.id, runId),
  )
  if (!currentRun || currentRun.projectId !== projectId || currentRun.status !== 'running')
    return

  const [nextJob] = await db.select().from(autonomousRunJobs).where(and(
    eq(autonomousRunJobs.runId, runId),
    eq(autonomousRunJobs.status, 'pending'),
  )).orderBy(asc(autonomousRunJobs.orderIndex)).limit(1)

  if (nextJob) {
    await changeAutonomousRunJob(projectId, runId, nextJob.id, { status: 'running' })
    await changeAutonomousRun(projectId, runId, { currentChapterId: nextJob.chapterId })
    const { startJob } = await import('./writing-job.service')
    await startJob(projectId, nextJob.writingJobId)
    return
  }

  const [activeJob] = await db.select().from(autonomousRunJobs).where(and(
    eq(autonomousRunJobs.runId, runId),
    eq(autonomousRunJobs.status, 'running'),
  )).orderBy(asc(autonomousRunJobs.orderIndex)).limit(1)

  if (activeJob) {
    const { startJob } = await import('./writing-job.service')
    await startJob(projectId, activeJob.writingJobId)
    return
  }

  const [failedJob] = await db.select({ id: autonomousRunJobs.id }).from(autonomousRunJobs).where(and(
    eq(autonomousRunJobs.runId, runId),
    eq(autonomousRunJobs.status, 'failed'),
  )).limit(1)

  await changeAutonomousRun(projectId, runId, {
    status: failedJob ? 'failed' : 'completed',
    finishedAt: new Date().toISOString(),
  })
}
