import type { Hono } from 'hono'
import { and, eq, ne } from 'drizzle-orm'
import { db } from '../db'
import { chapters } from '../db/schema'
import { assertVolumeBelongsToProject } from '../services/ownership.service'
import { fail, generateId, now, success, updatedFields } from '../utils'

export function registerChapterRoutes(app: Hono) {
  app.get('/api/projects/:projectId/chapters', async (c) => {
    const projectId = c.req.param('projectId')
    const rows = await db.select().from(chapters).where(eq(chapters.projectId, projectId))
    return c.json(success(rows))
  })

  app.get('/api/projects/:projectId/chapters/:id', async (c) => {
    const projectId = c.req.param('projectId')
    const id = c.req.param('id')
    const [row] = await db.select().from(chapters).where(
      and(eq(chapters.id, id), eq(chapters.projectId, projectId)),
    )
    if (!row)
      return c.json(fail('Chapter not found'), 404)
    return c.json(success(row))
  })

  app.post('/api/projects/:projectId/chapters', async (c) => {
    const projectId = c.req.param('projectId')
    const body = await c.req.json()
    if (body.volumeId) {
      try {
        await assertVolumeBelongsToProject(projectId, body.volumeId)
      }
      catch {
        return c.json(fail('卷不属于当前项目'), 400)
      }
    }
    // Check chapter number uniqueness within the same volume
    if (body.volumeId && body.chapterNumber != null) {
      const [existing] = await db.select({ id: chapters.id }).from(chapters).where(
        and(
          eq(chapters.projectId, projectId),
          eq(chapters.volumeId, body.volumeId),
          eq(chapters.chapterNumber, body.chapterNumber),
        ),
      )
      if (existing)
        return c.json(fail(`第 ${body.chapterNumber} 章已存在，请使用不同的章节序号`), 400)
    }
    const id = generateId()
    const timestamp = now()
    const [row] = await db.insert(chapters).values({
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
    }).returning()
    return c.json(success(row), 201)
  })

  app.patch('/api/projects/:projectId/chapters/:id', async (c) => {
    const projectId = c.req.param('projectId')
    const id = c.req.param('id')
    const body = await c.req.json()

    // Read current chapter first
    const [current] = await db.select().from(chapters).where(
      and(eq(chapters.id, id), eq(chapters.projectId, projectId)),
    )
    if (!current)
      return c.json(fail('Chapter not found'), 404)

    const targetVolumeId = body.volumeId ?? current.volumeId
    const targetChapterNumber = body.chapterNumber ?? current.chapterNumber

    if (body.volumeId) {
      try {
        await assertVolumeBelongsToProject(projectId, body.volumeId)
      }
      catch {
        return c.json(fail('卷不属于当前项目'), 400)
      }
    }

    // Check chapter number uniqueness within the same volume (exclude self)
    if (targetVolumeId && targetChapterNumber != null) {
      const [existing] = await db.select({ id: chapters.id }).from(chapters).where(
        and(
          eq(chapters.projectId, projectId),
          eq(chapters.volumeId, targetVolumeId),
          eq(chapters.chapterNumber, targetChapterNumber),
          ne(chapters.id, id),
        ),
      )
      if (existing)
        return c.json(fail(`第 ${targetChapterNumber} 章已存在，请使用不同的章节序号`), 400)
    }

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
    const [row] = await db.update(chapters).set(fields).where(
      and(eq(chapters.id, id), eq(chapters.projectId, projectId)),
    ).returning()
    if (!row)
      return c.json(fail('Chapter not found'), 404)
    return c.json(success(row))
  })

  app.delete('/api/projects/:projectId/chapters/:id', async (c) => {
    const projectId = c.req.param('projectId')
    const id = c.req.param('id')
    const [row] = await db.delete(chapters).where(
      and(eq(chapters.id, id), eq(chapters.projectId, projectId)),
    ).returning()
    if (!row)
      return c.json(fail('Chapter not found'), 404)
    return c.json(success(row, 'Chapter deleted'))
  })
}
