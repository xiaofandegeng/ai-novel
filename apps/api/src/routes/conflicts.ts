import type { Hono } from 'hono'
import { and, eq } from 'drizzle-orm'
import { db } from '../db'
import { conflicts } from '../db/schema'
import { fail, generateId, success } from '../utils'

export function registerConflictRoutes(app: Hono) {
  app.get('/api/projects/:projectId/conflicts', async (c) => {
    const projectId = c.req.param('projectId')
    const rows = await db.select().from(conflicts).where(eq(conflicts.projectId, projectId))
    return c.json(success(rows))
  })

  app.post('/api/projects/:projectId/conflicts', async (c) => {
    const projectId = c.req.param('projectId')
    const body = await c.req.json()
    const id = generateId()
    const [row] = await db.insert(conflicts).values({
      id,
      projectId,
      ...body,
    }).returning()
    return c.json(success(row))
  })

  app.patch('/api/projects/:projectId/conflicts/:id', async (c) => {
    const projectId = c.req.param('projectId')
    const id = c.req.param('id')
    const body = await c.req.json()
    const [row] = await db.update(conflicts).set({
      ...body,
      updatedAt: new Date().toISOString(),
    }).where(and(eq(conflicts.id, id), eq(conflicts.projectId, projectId))).returning()

    if (!row)
      return c.json(fail('Conflict not found'), 404)
    return c.json(success(row))
  })

  app.delete('/api/projects/:projectId/conflicts/:id', async (c) => {
    const projectId = c.req.param('projectId')
    const id = c.req.param('id')
    const [row] = await db.delete(conflicts).where(and(eq(conflicts.id, id), eq(conflicts.projectId, projectId))).returning()
    if (!row)
      return c.json(fail('Conflict not found'), 404)
    return c.json(success(row, 'Conflict deleted'))
  })
}
