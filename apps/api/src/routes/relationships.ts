import type { Hono } from 'hono'
import { and, eq } from 'drizzle-orm'
import { db } from '../db'
import { characterRelationships } from '../db/schema'
import { normalizeCharacterPair } from '../services/character-utils.service'
import { assertCharactersBelongToProject } from '../services/ownership.service'
import { fail, generateId, success, updatedFields } from '../utils'

export function registerRelationshipRoutes(app: Hono) {
  app.get('/api/projects/:projectId/relationships', async (c) => {
    const projectId = c.req.param('projectId')
    const rows = await db.select().from(characterRelationships).where(eq(characterRelationships.projectId, projectId))
    return c.json(success(rows))
  })

  app.post('/api/projects/:projectId/relationships', async (c) => {
    const projectId = c.req.param('projectId')
    const body = await c.req.json()
    const charAId = body.characterAId
    const charBId = body.characterBId

    if (!charAId || !charBId || charAId === charBId) {
      return c.json(fail('无效的角色ID'), 400)
    }

    try {
      await assertCharactersBelongToProject(projectId, [charAId, charBId])
    }
    catch {
      return c.json(fail('角色不属于当前项目'), 400)
    }

    // 规范化 ID 顺序，确保数据库中 A < b
    const [lowId, highId] = normalizeCharacterPair(charAId, charBId)

    // 检查是否已存在关系
    const [existing] = await db.select().from(characterRelationships).where(and(
      eq(characterRelationships.projectId, projectId),
      eq(characterRelationships.characterAId, lowId),
      eq(characterRelationships.characterBId, highId),
    ))

    if (existing) {
      return c.json(fail('该对角色之间已存在关系'), 400)
    }

    const id = generateId()
    const [row] = await db.insert(characterRelationships).values({
      id,
      projectId,
      characterAId: lowId,
      characterBId: highId,
      type: body.type,
      strength: body.strength,
      status: body.status,
      description: body.description,
    }).returning()
    return c.json(success(row))
  })

  app.patch('/api/projects/:projectId/relationships/:id', async (c) => {
    const projectId = c.req.param('projectId')
    const id = c.req.param('id')
    const body = await c.req.json()
    const charIds = [body.characterAId, body.characterBId].filter(Boolean)
    if (charIds.length > 0) {
      try {
        await assertCharactersBelongToProject(projectId, charIds)
      }
      catch {
        return c.json(fail('角色不属于当前项目'), 400)
      }
    }
    const fields = updatedFields({
      characterAId: body.characterAId,
      characterBId: body.characterBId,
      type: body.type,
      strength: body.strength,
      status: body.status,
      description: body.description,
    })
    const [row] = await db.update(characterRelationships).set(fields).where(and(eq(characterRelationships.id, id), eq(characterRelationships.projectId, projectId))).returning()

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
