import type { Hono } from 'hono'
import { and, asc, eq } from 'drizzle-orm'
import { db } from '../db'
import { chapterScenes } from '../db/schema'
import { runScenePostprocess } from '../services/chapter-postprocess.service'
import { assertChapterBelongsToProject } from '../services/ownership.service'
import { fail, generateId, now, success, updatedFields } from '../utils'

export function registerSceneRoutes(app: Hono) {
  app.get('/api/projects/:projectId/chapters/:chapterId/scenes', async (c) => {
    const projectId = c.req.param('projectId')
    const chapterId = c.req.param('chapterId')
    await assertChapterBelongsToProject(projectId, chapterId)
    const rows = await db.select().from(chapterScenes).where(
      and(eq(chapterScenes.projectId, projectId), eq(chapterScenes.chapterId, chapterId)),
    ).orderBy(asc(chapterScenes.orderIndex), asc(chapterScenes.sceneNumber))
    return c.json(success(rows))
  })

  app.post('/api/projects/:projectId/chapters/:chapterId/scenes/bulk', async (c) => {
    const projectId = c.req.param('projectId')
    const chapterId = c.req.param('chapterId')
    await assertChapterBelongsToProject(projectId, chapterId)
    const body = await c.req.json() as { scenes: any[], mode?: 'append' | 'replace' }

    if (!Array.isArray(body.scenes) || body.scenes.length === 0)
      return c.json(fail('scenes must be a non-empty array'), 400)

    for (const [i, s] of body.scenes.entries()) {
      if ((!s.title || !String(s.title).trim()) && (!s.purpose || !String(s.purpose).trim()))
        return c.json(fail(`Scene at index ${i} must have at least a title or purpose`), 400)
      if (s.sceneNumber != null && (typeof s.sceneNumber !== 'number' || s.sceneNumber < 1))
        return c.json(fail(`Scene at index ${i} has invalid sceneNumber`), 400)
      if (s.orderIndex != null && (typeof s.orderIndex !== 'number' || s.orderIndex < 0))
        return c.json(fail(`Scene at index ${i} has invalid orderIndex`), 400)
    }

    try {
      const resultRows = await db.transaction(async (tx) => {
        if (body.mode === 'replace') {
          await tx.delete(chapterScenes).where(
            and(eq(chapterScenes.projectId, projectId), eq(chapterScenes.chapterId, chapterId)),
          )
        }

        const existingCount = body.mode === 'replace'
          ? 0
          : (await tx.select({ id: chapterScenes.id }).from(chapterScenes).where(
              and(eq(chapterScenes.projectId, projectId), eq(chapterScenes.chapterId, chapterId)),
            )).length

        const values = body.scenes.map((s, i) => ({
          id: generateId(),
          projectId,
          chapterId,
          sceneNumber: s.sceneNumber ?? (existingCount + i + 1),
          title: s.title || null,
          location: s.location || null,
          timeline: s.timeline || null,
          purpose: s.purpose || null,
          summary: s.summary || null,
          characters: s.characters || null,
          targetWords: s.targetWords ?? null,
          content: s.content || null,
          orderIndex: s.orderIndex ?? (existingCount + i + 1),
          status: (s.status as 'planned' | 'drafting' | 'reviewed' | 'completed') || 'planned',
          conflict: s.conflict || null,
          beatType: s.beatType || null,
          entryHook: s.entryHook || null,
          turningPoint: s.turningPoint || null,
          exitHook: s.exitHook || null,
          emotionStart: s.emotionStart || null,
          emotionEnd: s.emotionEnd || null,
          conflictLevel: s.conflictLevel ?? null,
          requiredElements: s.requiredElements || null,
          updatedAt: now(),
        }))

        await tx.insert(chapterScenes).values(values)

        return await tx.select().from(chapterScenes).where(
          and(eq(chapterScenes.projectId, projectId), eq(chapterScenes.chapterId, chapterId)),
        ).orderBy(asc(chapterScenes.orderIndex), asc(chapterScenes.sceneNumber))
      })
      return c.json(success(resultRows), 201)
    }
    catch (error: any) {
      return c.json(fail(`Bulk create failed: ${error.message}`), 500)
    }
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
      status: body.status || 'planned',
      conflict: body.conflict,
      beatType: body.beatType,
      entryHook: body.entryHook,
      turningPoint: body.turningPoint,
      exitHook: body.exitHook,
      emotionStart: body.emotionStart,
      emotionEnd: body.emotionEnd,
      conflictLevel: body.conflictLevel,
      requiredElements: body.requiredElements,
    }).returning()
    return c.json(success(row), 201)
  })

  app.patch('/api/projects/:projectId/chapters/:chapterId/scenes/reorder', async (c) => {
    const projectId = c.req.param('projectId')
    const chapterId = c.req.param('chapterId')
    await assertChapterBelongsToProject(projectId, chapterId)
    const body = await c.req.json() as { orders: Array<{ id: string, orderIndex: number }> }
    if (!Array.isArray(body.orders))
      return c.json(fail('Invalid scene orders'), 400)

    try {
      await db.transaction(async (tx) => {
        for (const item of body.orders) {
          const [row] = await tx.update(chapterScenes).set({ orderIndex: item.orderIndex, updatedAt: now() }).where(and(
            eq(chapterScenes.id, item.id),
            eq(chapterScenes.projectId, projectId),
            eq(chapterScenes.chapterId, chapterId),
          )).returning()
          if (!row) {
            throw new Error('SCENE_NOT_FOUND')
          }
        }
      })
    }
    catch (error: any) {
      if (error.message === 'SCENE_NOT_FOUND')
        return c.json(fail('Scene not found'), 404)
      throw error
    }
    const rows = await db.select().from(chapterScenes).where(
      and(eq(chapterScenes.projectId, projectId), eq(chapterScenes.chapterId, chapterId)),
    ).orderBy(asc(chapterScenes.orderIndex))
    return c.json(success(rows))
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
      status: body.status,
      conflict: body.conflict,
      beatType: body.beatType,
      entryHook: body.entryHook,
      turningPoint: body.turningPoint,
      exitHook: body.exitHook,
      emotionStart: body.emotionStart,
      emotionEnd: body.emotionEnd,
      conflictLevel: body.conflictLevel,
      requiredElements: body.requiredElements,
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

  app.post('/api/projects/:projectId/chapters/:chapterId/scenes/:id/postprocess', async (c) => {
    const projectId = c.req.param('projectId')
    const chapterId = c.req.param('chapterId')
    const id = c.req.param('id')
    await assertChapterBelongsToProject(projectId, chapterId)
    const body = await c.req.json()
    if (!body.content)
      return c.json(fail('场景正文不能为空'), 400)

    try {
      const result = await runScenePostprocess({
        projectId,
        chapterId,
        sceneId: id,
        content: body.content,
      })
      return c.json(success(result))
    }
    catch (e: any) {
      return c.json(fail(e.message), 500)
    }
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
