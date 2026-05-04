import type { Hono } from 'hono'
import { and, eq } from 'drizzle-orm'
import { db } from '../db'
import { writingJobs } from '../db/schema'
import { assertOptionalChapterBelongsToProject } from '../services/ownership.service'
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
    return c.json(success(row), 201)
  })

  app.post('/api/projects/:projectId/writing-job/:id/start', async (c) => {
    const projectId = c.req.param('projectId')
    const id = c.req.param('id')
    const [row] = await db.update(writingJobs).set({
      status: 'running',
      lastError: null,
      updatedAt: new Date().toISOString(),
    }).where(and(eq(writingJobs.id, id), eq(writingJobs.projectId, projectId))).returning()
    if (!row)
      return c.json(fail('Job not found'), 404)
    return c.json(success(row))
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
}
