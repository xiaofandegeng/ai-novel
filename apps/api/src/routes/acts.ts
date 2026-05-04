import type { Hono } from 'hono'
import { and, eq } from 'drizzle-orm'
import { db } from '../db'
import { acts } from '../db/schema'
import { assertOptionalVolumeBelongsToProject } from '../services/ownership.service'
import { fail, generateId, success } from '../utils'

export function registerActRoutes(app: Hono) {
  app.get('/api/projects/:projectId/acts', async (c) => {
    const projectId = c.req.param('projectId')
    const rows = await db.select().from(acts).where(eq(acts.projectId, projectId))
    return c.json(success(rows))
  })

  app.post('/api/projects/:projectId/acts', async (c) => {
    const projectId = c.req.param('projectId')
    const body = await c.req.json()
    await assertOptionalVolumeBelongsToProject(projectId, body.volumeId)
    const id = generateId()
    const [row] = await db.insert(acts).values({
      id,
      projectId,
      volumeId: body.volumeId,
      title: body.title,
      description: body.description,
      theme: body.theme,
      keyEvents: body.keyEvents,
      targetChapterCount: body.targetChapterCount,
      orderIndex: body.orderIndex,
    }).returning()
    return c.json(success(row), 201)
  })

  app.patch('/api/projects/:projectId/acts/:id', async (c) => {
    const projectId = c.req.param('projectId')
    const id = c.req.param('id')
    const body = await c.req.json()
    await assertOptionalVolumeBelongsToProject(projectId, body.volumeId)
    const [row] = await db.update(acts).set({
      ...body,
      updatedAt: new Date().toISOString(),
    }).where(and(eq(acts.id, id), eq(acts.projectId, projectId))).returning()
    if (!row)
      return c.json(fail('Act not found'), 404)
    return c.json(success(row))
  })

  app.delete('/api/projects/:projectId/acts/:id', async (c) => {
    const projectId = c.req.param('projectId')
    const id = c.req.param('id')
    const [row] = await db.delete(acts).where(
      and(eq(acts.id, id), eq(acts.projectId, projectId)),
    ).returning()
    if (!row)
      return c.json(fail('Act not found'), 404)
    return c.json(success(row, 'Act deleted'))
  })
}
