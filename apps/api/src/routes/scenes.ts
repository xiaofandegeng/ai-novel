import type { Hono } from 'hono'
import { and, eq } from 'drizzle-orm'
import { db } from '../db'
import { chapterScenes } from '../db/schema'
import { assertChapterBelongsToProject } from '../services/ownership.service'
import { fail, generateId, success, updatedFields } from '../utils'

export function registerSceneRoutes(app: Hono) {
  app.get('/api/projects/:projectId/chapters/:chapterId/scenes', async (c) => {
    const projectId = c.req.param('projectId')
    const chapterId = c.req.param('chapterId')
    await assertChapterBelongsToProject(projectId, chapterId)
    const rows = await db.select().from(chapterScenes).where(
      and(eq(chapterScenes.projectId, projectId), eq(chapterScenes.chapterId, chapterId)),
    )
    return c.json(success(rows))
  })

  app.post('/api/projects/:projectId/chapters/:chapterId/scenes', async (c) => {
    const projectId = c.req.param('projectId')
    const chapterId = c.req.param('chapterId')
    await assertChapterBelongsToProject(projectId, chapterId)
    const body = await c.req.json()
    const id = generateId()
    const [row] = await db.insert(chapterScenes).values({
      id,
      projectId,
      chapterId,
      sceneNumber: body.sceneNumber,
      title: body.title,
      location: body.location,
      timeline: body.timeline,
      purpose: body.purpose,
      summary: body.summary,
      characters: body.characters,
      targetWords: body.targetWords,
      content: body.content,
      orderIndex: body.orderIndex,
    }).returning()
    return c.json(success(row), 201)
  })

  app.patch('/api/projects/:projectId/chapters/:chapterId/scenes/:id', async (c) => {
    const projectId = c.req.param('projectId')
    const chapterId = c.req.param('chapterId')
    const id = c.req.param('id')
    await assertChapterBelongsToProject(projectId, chapterId)
    const body = await c.req.json()
    const fields = updatedFields({
      sceneNumber: body.sceneNumber,
      title: body.title,
      location: body.location,
      timeline: body.timeline,
      purpose: body.purpose,
      summary: body.summary,
      characters: body.characters,
      targetWords: body.targetWords,
      content: body.content,
      orderIndex: body.orderIndex,
    })
    const [row] = await db.update(chapterScenes).set(fields).where(and(
      eq(chapterScenes.id, id),
      eq(chapterScenes.projectId, projectId),
      eq(chapterScenes.chapterId, chapterId),
    )).returning()
    if (!row)
      return c.json(fail('Scene not found'), 404)
    return c.json(success(row))
  })

  app.delete('/api/projects/:projectId/chapters/:chapterId/scenes/:id', async (c) => {
    const projectId = c.req.param('projectId')
    const chapterId = c.req.param('chapterId')
    const id = c.req.param('id')
    await assertChapterBelongsToProject(projectId, chapterId)
    const [row] = await db.delete(chapterScenes).where(
      and(
        eq(chapterScenes.id, id),
        eq(chapterScenes.projectId, projectId),
        eq(chapterScenes.chapterId, chapterId),
      ),
    ).returning()
    if (!row)
      return c.json(fail('Scene not found'), 404)
    return c.json(success(row, 'Scene deleted'))
  })
}
