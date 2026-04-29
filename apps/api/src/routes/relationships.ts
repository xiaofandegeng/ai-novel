import type { Hono } from 'hono'
import { and, eq } from 'drizzle-orm'
import { db } from '../db'
import { characterRelationships } from '../db/schema'
import { fail, generateId, success } from '../utils'

export function registerRelationshipRoutes(app: Hono) {
  app.get('/api/projects/:projectId/relationships', async (c) => {
    const projectId = c.req.param('projectId')
    const rows = await db.select().from(characterRelationships).where(eq(characterRelationships.projectId, projectId))
    return c.json(success(rows))
  })

  app.post('/api/projects/:projectId/relationships', async (c) => {
    const projectId = c.req.param('projectId')
    const body = await c.req.json()
    const id = generateId()
    const [row] = await db.insert(characterRelationships).values({
      id,
      projectId,
      ...body,
    }).returning()
    return c.json(success(row))
  })

  app.patch('/api/projects/:projectId/relationships/:id', async (c) => {
    const projectId = c.req.param('projectId')
    const id = c.req.param('id')
    const body = await c.req.json()
    const [row] = await db.update(characterRelationships).set({
      ...body,
      updatedAt: new Date().toISOString(),
    }).where(and(eq(characterRelationships.id, id), eq(characterRelationships.projectId, projectId))).returning()

    if (!row)
      return c.json(fail('Relationship not found'), 404)
    return c.json(success(row))
  })

  app.delete('/api/projects/:projectId/relationships/:id', async (c) => {
    const projectId = c.req.param('projectId')
    const id = c.req.param('id')
    const [row] = await db.delete(characterRelationships).where(and(eq(characterRelationships.id, id), eq(characterRelationships.projectId, projectId))).returning()
    if (!row)
      return c.json(fail('Relationship not found'), 404)
    return c.json(success(row, 'Relationship deleted'))
  })
}
