import type { Hono } from 'hono'
import { and, eq } from 'drizzle-orm'
import { db } from '../db'
import { storyFactTriples } from '../db/schema'
import { assertOptionalChapterBelongsToProject } from '../services/ownership.service'
import { fail, generateId, success } from '../utils'

export function registerTripleRoutes(app: Hono) {
  app.get('/api/projects/:projectId/triples', async (c) => {
    const projectId = c.req.param('projectId')
    const rows = await db.select().from(storyFactTriples).where(eq(storyFactTriples.projectId, projectId))
    return c.json(success(rows))
  })

  app.post('/api/projects/:projectId/triples', async (c) => {
    const projectId = c.req.param('projectId')
    const body = await c.req.json()
    await assertOptionalChapterBelongsToProject(projectId, body.sourceChapterId)
    const id = generateId()
    const [row] = await db.insert(storyFactTriples).values({
      id,
      projectId,
      subjectType: body.subjectType,
      subjectName: body.subjectName,
      predicate: body.predicate,
      objectType: body.objectType,
      objectName: body.objectName,
      confidence: body.confidence || 70,
      sourceType: body.sourceType || 'manual',
      sourceChapterId: body.sourceChapterId,
      status: body.status || 'pending',
      relatedChapters: body.relatedChapters,
      notes: body.notes,
    }).returning()
    return c.json(success(row), 201)
  })

  app.patch('/api/projects/:projectId/triples/:id', async (c) => {
    const projectId = c.req.param('projectId')
    const id = c.req.param('id')
    const body = await c.req.json()
    await assertOptionalChapterBelongsToProject(projectId, body.sourceChapterId)
    const [row] = await db.update(storyFactTriples).set({
      ...body,
      updatedAt: new Date().toISOString(),
    }).where(and(eq(storyFactTriples.id, id), eq(storyFactTriples.projectId, projectId))).returning()
    if (!row)
      return c.json(fail('Triple not found'), 404)
    return c.json(success(row))
  })

  app.delete('/api/projects/:projectId/triples/:id', async (c) => {
    const projectId = c.req.param('projectId')
    const id = c.req.param('id')
    const [row] = await db.delete(storyFactTriples).where(
      and(eq(storyFactTriples.id, id), eq(storyFactTriples.projectId, projectId)),
    ).returning()
    if (!row)
      return c.json(fail('Triple not found'), 404)
    return c.json(success(row, 'Triple deleted'))
  })
}
