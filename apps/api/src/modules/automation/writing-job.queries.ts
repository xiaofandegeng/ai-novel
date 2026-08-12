import { and, desc, eq, inArray } from 'drizzle-orm'
import { db } from '../../db'
import { writingJobs } from '../../db/schema'

export async function getLatestWritingJob(projectId: string) {
  const [activeRow] = await db.select().from(writingJobs).where(and(
    eq(writingJobs.projectId, projectId),
    inArray(writingJobs.status, ['idle', 'running']),
  )).orderBy(desc(writingJobs.createdAt))
  if (activeRow)
    return activeRow

  const [row] = await db.select().from(writingJobs).where(eq(writingJobs.projectId, projectId)).orderBy(desc(writingJobs.createdAt))
  return row ?? null
}

export async function getWritingJob(projectId: string, id: string) {
  const [row] = await db.select().from(writingJobs).where(and(
    eq(writingJobs.id, id),
    eq(writingJobs.projectId, projectId),
  ))
  return row ?? null
}
