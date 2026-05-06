import type { Hono } from 'hono'
import { and, eq } from 'drizzle-orm'
import { db } from '../db'
import { writingJobs } from '../db/schema'
import { assertOptionalChapterBelongsToProject } from '../services/ownership.service'
import {
  approveStep,
  getJobSteps,
  initializeJobSteps,
  rejectStep,
  retryStep,
  startJob,
} from '../services/writing-job.service'
import { fail, generateId, success } from '../utils'

export function registerWritingJobRoutes(app: Hono) {
  app.get('/api/projects/:projectId/writing-job', async (c) => {
    const projectId = c.req.param('projectId')
    const [row] = await db.select().from(writingJobs).where(eq(writingJobs.projectId, projectId))
    return c.json(success(row || null))
  })

  app.post('/api/projects/:projectId/writing-job', async (c) => {
    const projectId = c.req.param('projectId')
    const body = await c.req.json()
    await assertOptionalChapterBelongsToProject(projectId, body.currentChapterId)
    const id = generateId()
    const [row] = await db.insert(writingJobs).values({
      id,
      projectId,
      mode: body.mode,
      currentChapterId: body.currentChapterId,
      status: 'idle',
    }).returning()

    // Initialize steps for the new job
    await initializeJobSteps(id)

    return c.json(success(row), 201)
  })

  app.post('/api/projects/:projectId/writing-job/:id/start', async (c) => {
    const projectId = c.req.param('projectId')
    const id = c.req.param('id')

    try {
      await startJob(projectId, id)
      // Fetch the updated job to return
      const [row] = await db.select().from(writingJobs).where(
        and(eq(writingJobs.id, id), eq(writingJobs.projectId, projectId)),
      )
      if (!row)
        return c.json(fail('Job not found'), 404)
      return c.json(success(row))
    }
    catch (e: any) {
      return c.json(fail(e.message || 'Failed to start job'), 500)
    }
  })

  app.post('/api/projects/:projectId/writing-job/:id/pause', async (c) => {
    const projectId = c.req.param('projectId')
    const id = c.req.param('id')
    const [row] = await db.update(writingJobs).set({
      status: 'paused',
      updatedAt: new Date().toISOString(),
    }).where(and(eq(writingJobs.id, id), eq(writingJobs.projectId, projectId))).returning()
    if (!row)
      return c.json(fail('Job not found'), 404)
    return c.json(success(row))
  })

  app.post('/api/projects/:projectId/writing-job/:id/continue', async (c) => {
    const projectId = c.req.param('projectId')
    const id = c.req.param('id')
    const [row] = await db.update(writingJobs).set({
      status: 'running',
      lastError: null,
      updatedAt: new Date().toISOString(),
    }).where(and(eq(writingJobs.id, id), eq(writingJobs.projectId, projectId), eq(writingJobs.status, 'waiting_review'))).returning()
    if (!row)
      return c.json(fail('Job not found or not in review state'), 404)
    return c.json(success(row))
  })

  app.delete('/api/projects/:projectId/writing-job/:id', async (c) => {
    const projectId = c.req.param('projectId')
    const id = c.req.param('id')
    const [row] = await db.delete(writingJobs).where(
      and(eq(writingJobs.id, id), eq(writingJobs.projectId, projectId)),
    ).returning()
    if (!row)
      return c.json(fail('Job not found'), 404)
    return c.json(success(row, 'Job deleted'))
  })

  // Step-related endpoints

  app.get('/api/projects/:projectId/writing-job/:jobId/steps', async (c) => {
    const projectId = c.req.param('projectId')
    const jobId = c.req.param('jobId')

    // Verify job belongs to project
    const [job] = await db.select().from(writingJobs).where(
      and(eq(writingJobs.id, jobId), eq(writingJobs.projectId, projectId)),
    )
    if (!job)
      return c.json(fail('Job not found'), 404)

    const steps = await getJobSteps(jobId)
    return c.json(success(steps))
  })

  app.post('/api/projects/:projectId/writing-job/:jobId/steps/:stepId/approve', async (c) => {
    const projectId = c.req.param('projectId')
    const jobId = c.req.param('jobId')
    const stepId = c.req.param('stepId')

    try {
      await approveStep(projectId, jobId, stepId)
      // Return updated job and steps
      const [job] = await db.select().from(writingJobs).where(
        and(eq(writingJobs.id, jobId), eq(writingJobs.projectId, projectId)),
      )
      const steps = await getJobSteps(jobId)
      return c.json(success({ job, steps }))
    }
    catch (e: any) {
      return c.json(fail(e.message || 'Failed to approve step'), 400)
    }
  })

  app.post('/api/projects/:projectId/writing-job/:jobId/steps/:stepId/reject', async (c) => {
    const projectId = c.req.param('projectId')
    const jobId = c.req.param('jobId')
    const stepId = c.req.param('stepId')
    const body = await c.req.json().catch(() => ({}))

    try {
      await rejectStep(projectId, jobId, stepId, body.reason)
      const [job] = await db.select().from(writingJobs).where(
        and(eq(writingJobs.id, jobId), eq(writingJobs.projectId, projectId)),
      )
      const steps = await getJobSteps(jobId)
      return c.json(success({ job, steps }))
    }
    catch (e: any) {
      return c.json(fail(e.message || 'Failed to reject step'), 400)
    }
  })

  app.post('/api/projects/:projectId/writing-job/:jobId/retry', async (c) => {
    const projectId = c.req.param('projectId')
    const jobId = c.req.param('jobId')
    const body = await c.req.json().catch(() => ({}))
    const stepId = body.stepId

    if (!stepId) {
      return c.json(fail('stepId is required'), 400)
    }

    try {
      await retryStep(projectId, jobId, stepId)
      const [job] = await db.select().from(writingJobs).where(
        and(eq(writingJobs.id, jobId), eq(writingJobs.projectId, projectId)),
      )
      const steps = await getJobSteps(jobId)
      return c.json(success({ job, steps }))
    }
    catch (e: any) {
      return c.json(fail(e.message || 'Failed to retry step'), 400)
    }
  })
}
