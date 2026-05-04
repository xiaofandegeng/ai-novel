import type { Hono } from 'hono'
import { and, eq } from 'drizzle-orm'
import { db } from '../db'
import { chapterElements } from '../db/schema'
import { assertChapterBelongsToProject } from '../services/ownership.service'
import { fail, generateId, success } from '../utils'

interface NormalizedElement {
  elementType: 'character' | 'location' | 'item' | 'organization' | 'event'
  elementId: string | null
  elementName: string
  relationType: 'appears' | 'mentioned' | 'scene' | 'uses' | 'involved' | 'occurs'
  importance: 'major' | 'normal' | 'minor'
  appearanceOrder: number | null
  notes: string | null
}

export function registerChapterElementRoutes(app: Hono) {
  app.get('/api/projects/:projectId/chapters/:chapterId/elements', async (c) => {
    const projectId = c.req.param('projectId')
    const chapterId = c.req.param('chapterId')
    await assertChapterBelongsToProject(projectId, chapterId)
    const rows = await db.select().from(chapterElements).where(
      and(eq(chapterElements.projectId, projectId), eq(chapterElements.chapterId, chapterId)),
    )
    return c.json(success(rows))
  })

  const VALID_ELEMENT_TYPES = ['character', 'location', 'item', 'organization', 'event'] as const
  const VALID_RELATION_TYPES = ['appears', 'mentioned', 'scene', 'uses', 'involved', 'occurs'] as const
  const VALID_IMPORTANCE = ['major', 'normal', 'minor'] as const

  app.put('/api/projects/:projectId/chapters/:chapterId/elements', async (c) => {
    const projectId = c.req.param('projectId')
    const chapterId = c.req.param('chapterId')
    await assertChapterBelongsToProject(projectId, chapterId)
    const body = await c.req.json()
    const incoming = Array.isArray(body.elements) ? body.elements : []

    // Validate empty names
    if (incoming.some((el: any) => !el.elementName?.trim()))
      return c.json(fail('章节元素名称不能为空'), 400)

    // Validate enum values
    if (incoming.some((el: any) => !VALID_ELEMENT_TYPES.includes(el.elementType)))
      return c.json(fail('章节元素类型不合法'), 400)
    if (incoming.some((el: any) => !VALID_RELATION_TYPES.includes(el.relationType)))
      return c.json(fail('章节元素关系类型不合法'), 400)
    if (incoming.some((el: any) => el.importance && !VALID_IMPORTANCE.includes(el.importance)))
      return c.json(fail('章节元素重要性不合法'), 400)

    // Check duplicates
    const seen = new Set<string>()
    for (const el of incoming) {
      const key = `${el.elementType}:${el.elementName.trim()}:${el.relationType}`
      if (seen.has(key))
        return c.json(fail(`章节元素重复：${el.elementName}`), 400)
      seen.add(key)
    }

    const normalized: NormalizedElement[] = incoming.map((el: any) => ({
      elementType: el.elementType as 'character' | 'location' | 'item' | 'organization' | 'event',
      elementId: el.elementId || null,
      elementName: el.elementName.trim(),
      relationType: el.relationType as 'appears' | 'mentioned' | 'scene' | 'uses' | 'involved' | 'occurs',
      importance: (el.importance || 'normal') as 'major' | 'normal' | 'minor',
      appearanceOrder: el.appearanceOrder ?? null,
      notes: el.notes || null,
    }))

    const rows = await db.transaction(async (tx) => {
      await tx.delete(chapterElements).where(
        and(eq(chapterElements.projectId, projectId), eq(chapterElements.chapterId, chapterId)),
      )
      if (normalized.length === 0)
        return []
      return tx.insert(chapterElements).values(normalized.map(el => ({
        id: generateId(),
        projectId,
        chapterId,
        elementType: el.elementType,
        elementId: el.elementId,
        elementName: el.elementName,
        relationType: el.relationType,
        importance: el.importance,
        appearanceOrder: el.appearanceOrder,
        notes: el.notes,
      }))).returning()
    })
    return c.json(success(rows))
  })

  app.post('/api/projects/:projectId/chapters/:chapterId/elements', async (c) => {
    const projectId = c.req.param('projectId')
    const chapterId = c.req.param('chapterId')
    await assertChapterBelongsToProject(projectId, chapterId)
    const body = await c.req.json()
    const id = generateId()
    const [row] = await db.insert(chapterElements).values({
      id,
      projectId,
      chapterId,
      elementType: body.elementType,
      elementId: body.elementId,
      elementName: body.elementName,
      relationType: body.relationType,
      importance: body.importance || 'normal',
      appearanceOrder: body.appearanceOrder,
      notes: body.notes,
    }).returning()
    return c.json(success(row), 201)
  })

  app.patch('/api/projects/:projectId/chapters/:chapterId/elements/:id', async (c) => {
    const projectId = c.req.param('projectId')
    const chapterId = c.req.param('chapterId')
    const id = c.req.param('id')
    await assertChapterBelongsToProject(projectId, chapterId)
    const body = await c.req.json()
    const [row] = await db.update(chapterElements).set({
      ...body,
      updatedAt: new Date().toISOString(),
    }).where(and(
      eq(chapterElements.id, id),
      eq(chapterElements.projectId, projectId),
      eq(chapterElements.chapterId, chapterId),
    )).returning()
    if (!row)
      return c.json(fail('Element not found'), 404)
    return c.json(success(row))
  })

  app.delete('/api/projects/:projectId/chapters/:chapterId/elements/:id', async (c) => {
    const projectId = c.req.param('projectId')
    const chapterId = c.req.param('chapterId')
    const id = c.req.param('id')
    await assertChapterBelongsToProject(projectId, chapterId)
    const [row] = await db.delete(chapterElements).where(
      and(
        eq(chapterElements.id, id),
        eq(chapterElements.projectId, projectId),
        eq(chapterElements.chapterId, chapterId),
      ),
    ).returning()
    if (!row)
      return c.json(fail('Element not found'), 404)
    return c.json(success(row, 'Element deleted'))
  })
}
