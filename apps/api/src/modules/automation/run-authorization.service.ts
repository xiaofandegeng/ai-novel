import { and, eq } from 'drizzle-orm'
import { db } from '../../db'
import { autonomousWritingRuns, writingJobs } from '../../db/schema'

export class RunAuthorizationRevokedError extends Error {
  readonly code = 'AUTONOMOUS_RUN_AUTHORIZATION_REVOKED'

  constructor(runId: string) {
    super(`Autonomous run ${runId} is not authorized to write`)
    this.name = 'RunAuthorizationRevokedError'
  }
}

export async function assertWritingJobAuthorized(projectId: string, writingJobId: string): Promise<void> {
  const [job] = await db.select({ autonomousRunId: writingJobs.autonomousRunId }).from(writingJobs).where(and(
    eq(writingJobs.id, writingJobId),
    eq(writingJobs.projectId, projectId),
  )).limit(1)
  if (!job)
    throw new Error('Writing job not found')
  if (!job.autonomousRunId)
    return

  const [run] = await db.select({ status: autonomousWritingRuns.status }).from(autonomousWritingRuns).where(and(
    eq(autonomousWritingRuns.id, job.autonomousRunId),
    eq(autonomousWritingRuns.projectId, projectId),
  )).limit(1)
  if (!run || run.status !== 'running')
    throw new RunAuthorizationRevokedError(job.autonomousRunId)
}
