import type { Hono } from 'hono'
import { and, eq } from 'drizzle-orm'
import { db } from '../db'
import { characterRelationships } from '../db/schema'
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
    const charIds = [body.characterAId, body.characterBId].filter(Boolean)
    if (charIds.length > 0) {
      try {
        await assertCharactersBelongToProject(projectId, charIds)
      }
      catch {
        return c.json(fail('角色不属于当前项目'), 400)
      }
    }
    const id = generateId()
    const [row] = await db.insert(characterRelationships).values({
      id,
      projectId,
      characterAId: body.characterAId,
      characterBId: body.characterBId,
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
