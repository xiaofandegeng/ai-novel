import type { Hono } from 'hono'
import { and, eq } from 'drizzle-orm'
import { db } from '../db'
import { chapters } from '../db/schema'
import { fail, generateId, now, success, updatedFields } from '../utils'

export function registerChapterRoutes(app: Hono) {
  app.get('/api/projects/:projectId/chapters', (c) => {
    const projectId = c.req.param('projectId')
    const rows = db.select().from(chapters).where(eq(chapters.projectId, projectId)).all()
    return c.json(success(rows))
  })

  app.get('/api/projects/:projectId/chapters/:id', (c) => {
    const projectId = c.req.param('projectId')
    const id = c.req.param('id')
    const row = db.select().from(chapters).where(
      and(eq(chapters.id, id), eq(chapters.projectId, projectId)),
    ).get()
    if (!row)
      return c.json(fail('Chapter not found'), 404)
    return c.json(success(row))
  })

  app.post('/api/projects/:projectId/chapters', async (c) => {
    const projectId = c.req.param('projectId')
    const body = await c.req.json()
    const id = generateId()
    const timestamp = now()
    const row = db.insert(chapters).values({
      id,
      projectId,
      volumeId: body.volumeId,
      chapterNumber: body.chapterNumber,
      title: body.title,
      outline: body.outline,
      draft: body.draft,
      summary: body.summary,
      characters: body.characters,
      goals: body.goals,
      conflicts: body.conflicts,
      events: body.events,
      emotionalArc: body.emotionalArc,
      foreshadowing: body.foreshadowing,
      endingHook: body.endingHook,
      status: body.status ?? 'not_started',
      createdAt: timestamp,
      updatedAt: timestamp,
    }).returning().get()
    return c.json(success(row), 201)
  })

  app.patch('/api/projects/:projectId/chapters/:id', async (c) => {
    const projectId = c.req.param('projectId')
    const id = c.req.param('id')
    const body = await c.req.json()
    const fields = updatedFields({
      volumeId: body.volumeId,
      chapterNumber: body.chapterNumber,
      title: body.title,
      outline: body.outline,
      draft: body.draft,
      summary: body.summary,
      characters: body.characters,
      goals: body.goals,
      conflicts: body.conflicts,
      events: body.events,
      emotionalArc: body.emotionalArc,
      foreshadowing: body.foreshadowing,
      endingHook: body.endingHook,
      status: body.status,
    })
    const row = db.update(chapters).set(fields).where(
      and(eq(chapters.id, id), eq(chapters.projectId, projectId)),
    ).returning().get()
    if (!row)
      return c.json(fail('Chapter not found'), 404)
    return c.json(success(row))
  })

  app.delete('/api/projects/:projectId/chapters/:id', (c) => {
    const projectId = c.req.param('projectId')
    const id = c.req.param('id')
    const row = db.delete(chapters).where(
      and(eq(chapters.id, id), eq(chapters.projectId, projectId)),
    ).returning().get()
    if (!row)
      return c.json(fail('Chapter not found'), 404)
    return c.json(success(row, 'Chapter deleted'))
  })
}
