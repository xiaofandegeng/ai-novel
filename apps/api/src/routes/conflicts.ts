import type { Hono } from 'hono'
import { and, eq } from 'drizzle-orm'
import { db } from '../db'
import { conflicts } from '../db/schema'
import { matchCharacterIdsFromText } from '../services/character-utils.service'
import { fail, generateId, success, updatedFields } from '../utils'

export function registerConflictRoutes(app: Hono) {
  app.get('/api/projects/:projectId/conflicts', async (c) => {
    const projectId = c.req.param('projectId')
    const rows = await db.select().from(conflicts).where(eq(conflicts.projectId, projectId))
    return c.json(success(rows))
  })

  app.post('/api/projects/:projectId/conflicts', async (c) => {
    const projectId = c.req.param('projectId')
    const body = await c.req.json()

    let participantIds = body.participantIds
    if (!participantIds || (Array.isArray(participantIds) && participantIds.length === 0)) {
      participantIds = await matchCharacterIdsFromText(projectId, body.participants)
    }

    const id = generateId()
    const [row] = await db.insert(conflicts).values({
      id,
      projectId,
      title: body.title,
      type: body.type,
      intensity: body.intensity,
      status: body.status,
      participants: body.participants,
      participantIds: participantIds ? JSON.stringify(participantIds) : null,
      description: body.description,
      resolution: body.resolution,
    }).returning()
    return c.json(success(row))
  })

  app.patch('/api/projects/:projectId/conflicts/:id', async (c) => {
    const projectId = c.req.param('projectId')
    const id = c.req.param('id')
    const body = await c.req.json()

    let participantIds = body.participantIds
    if (body.participants !== undefined && (!participantIds || (Array.isArray(participantIds) && participantIds.length === 0))) {
      participantIds = await matchCharacterIdsFromText(projectId, body.participants)
    }

    const fields = updatedFields({
      title: body.title,
      type: body.type,
      intensity: body.intensity,
      status: body.status,
      participants: body.participants,
      participantIds: participantIds ? JSON.stringify(participantIds) : undefined,
      description: body.description,
      resolution: body.resolution,
    })
    const [row] = await db.update(conflicts).set(fields).where(and(eq(conflicts.id, id), eq(conflicts.projectId, projectId))).returning()

    if (!row)
      return c.json(fail('Conflict not found'), 404)
    return c.json(success(row))
  })

  app.delete('/api/projects/:projectId/conflicts/:id', async (c) => {
    const projectId = c.req.param('projectId')
    const id = c.req.param('id')
    const [row] = await db.delete(conflicts).where(and(eq(conflicts.id, id), eq(conflicts.projectId, projectId))).returning()
    if (!row)
      return c.json(fail('Conflict not found'), 404)
    return c.json(success(row, 'Conflict deleted'))
  })
}
