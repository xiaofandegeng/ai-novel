import type { Hono } from 'hono'
import { and, eq } from 'drizzle-orm'
import { db } from '../db'
import { foreshadowingCharacters, foreshadowingItems } from '../db/schema'
import { matchCharacterIdsFromText } from '../services/character-utils.service'
import { assertCharactersBelongToProject, assertForeshadowingBelongsToProject, assertOptionalChapterBelongsToProject } from '../services/ownership.service'
import { fail, generateId, success, updatedFields } from '../utils'

export function registerForeshadowingRoutes(app: Hono) {
  app.get('/api/projects/:projectId/foreshadowing', async (c) => {
    const projectId = c.req.param('projectId')
    const rows = await db.select().from(foreshadowingItems).where(eq(foreshadowingItems.projectId, projectId))
    return c.json(success(rows))
  })

  app.post('/api/projects/:projectId/foreshadowing', async (c) => {
    const projectId = c.req.param('projectId')
    const body = await c.req.json()
    await assertOptionalChapterBelongsToProject(projectId, body.setupChapterId)
    await assertOptionalChapterBelongsToProject(projectId, body.expectedPayoffChapterId)
    await assertOptionalChapterBelongsToProject(projectId, body.payoffChapterId)

    let characterIds = body.characterIds
    if (!characterIds || (Array.isArray(characterIds) && characterIds.length === 0)) {
      characterIds = await matchCharacterIdsFromText(projectId, body.relatedCharacters)
    }

    const id = generateId()
    const [row] = await db.insert(foreshadowingItems).values({
      id,
      projectId,
      title: body.title,
      description: body.description,
      setupChapterId: body.setupChapterId,
      expectedPayoffChapterId: body.expectedPayoffChapterId,
      payoffChapterId: body.payoffChapterId,
      status: body.status || 'open',
      importance: body.importance || 'normal',
      relatedCharacters: body.relatedCharacters,
      characterIds: characterIds ? JSON.stringify(characterIds) : null,
      relatedEvents: body.relatedEvents,
      notes: body.notes,
    }).returning()
    return c.json(success(row), 201)
  })

  app.patch('/api/projects/:projectId/foreshadowing/:id', async (c) => {
    const projectId = c.req.param('projectId')
    const id = c.req.param('id')
    const body = await c.req.json()
    await assertOptionalChapterBelongsToProject(projectId, body.setupChapterId)
    await assertOptionalChapterBelongsToProject(projectId, body.expectedPayoffChapterId)
    await assertOptionalChapterBelongsToProject(projectId, body.payoffChapterId)

    let characterIds = body.characterIds
    if (body.relatedCharacters !== undefined && (!characterIds || (Array.isArray(characterIds) && characterIds.length === 0))) {
      characterIds = await matchCharacterIdsFromText(projectId, body.relatedCharacters)
    }

    const fields = updatedFields({
      title: body.title,
      description: body.description,
      setupChapterId: body.setupChapterId,
      expectedPayoffChapterId: body.expectedPayoffChapterId,
      payoffChapterId: body.payoffChapterId,
      status: body.status,
      importance: body.importance,
      relatedCharacters: body.relatedCharacters,
      characterIds: characterIds ? JSON.stringify(characterIds) : undefined,
      relatedEvents: body.relatedEvents,
      notes: body.notes,
    })
    const [row] = await db.update(foreshadowingItems).set(fields).where(and(eq(foreshadowingItems.id, id), eq(foreshadowingItems.projectId, projectId))).returning()
    if (!row)
      return c.json(fail('Foreshadowing item not found'), 404)
    return c.json(success(row))
  })

  app.delete('/api/projects/:projectId/foreshadowing/:id', async (c) => {
    const projectId = c.req.param('projectId')
    const id = c.req.param('id')
    const [row] = await db.delete(foreshadowingItems).where(
      and(eq(foreshadowingItems.id, id), eq(foreshadowingItems.projectId, projectId)),
    ).returning()
    if (!row)
      return c.json(fail('Foreshadowing item not found'), 404)
    return c.json(success(row, 'Foreshadowing item deleted'))
  })

  // Foreshadowing Characters
  app.get('/api/projects/:projectId/foreshadowing/:id/characters', async (c) => {
    const projectId = c.req.param('projectId')
    const id = c.req.param('id')
    await assertForeshadowingBelongsToProject(projectId, id)

    const rows = await db.select().from(foreshadowingCharacters).where(
      and(eq(foreshadowingCharacters.projectId, projectId), eq(foreshadowingCharacters.foreshadowingId, id)),
    )
    return c.json(success(rows))
  })

  app.put('/api/projects/:projectId/foreshadowing/:id/characters', async (c) => {
    const projectId = c.req.param('projectId')
    const id = c.req.param('id')
    const body = await c.req.json() as Array<{ characterId: string, relationType: any }>

    await assertForeshadowingBelongsToProject(projectId, id)
    await assertCharactersBelongToProject(projectId, body.map(p => p.characterId))

    await db.transaction(async (tx) => {
      await tx.delete(foreshadowingCharacters).where(
        and(eq(foreshadowingCharacters.projectId, projectId), eq(foreshadowingCharacters.foreshadowingId, id)),
      )

      if (body.length > 0) {
        await tx.insert(foreshadowingCharacters).values(
          body.map(p => ({
            id: generateId(),
            projectId,
            foreshadowingId: id,
            characterId: p.characterId,
            relationType: p.relationType || 'related',
          })),
        )
      }
    })

    return c.json(success(null, 'Characters updated'))
  })
}
