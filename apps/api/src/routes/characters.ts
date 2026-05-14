import type { Hono } from 'hono'
import { and, eq } from 'drizzle-orm'
import { db } from '../db'
import { characters } from '../db/schema'
import { autoLinkCharacterToGraph } from '../services/character-auto-link.service'
import { inferRelationshipsFromBios } from '../services/character-inference.service'
import { fail, generateId, now, success, updatedFields } from '../utils'

export function registerCharacterRoutes(app: Hono) {
  app.post('/api/projects/:projectId/characters/infer-relationships', async (c) => {
    const projectId = c.req.param('projectId')
    try {
      const result = await inferRelationshipsFromBios(projectId)
      return c.json(success(result))
    }
    catch (e: any) {
      return c.json(fail(e.message || '推导失败'), 500)
    }
  })

  app.post('/api/projects/:projectId/characters/:id/auto-link', async (c) => {
    const projectId = c.req.param('projectId')
    const id = c.req.param('id')
    try {
      const result = await autoLinkCharacterToGraph(projectId, id)
      return c.json(success(result))
    }
    catch (e: any) {
      return c.json(fail(e.message || '自动关联关系网失败'), 500)
    }
  })

  app.get('/api/projects/:projectId/characters', async (c) => {
    const projectId = c.req.param('projectId')
    const rows = await db.select().from(characters).where(eq(characters.projectId, projectId))
    return c.json(success(rows))
  })

  app.get('/api/projects/:projectId/characters/:id', async (c) => {
    const projectId = c.req.param('projectId')
    const id = c.req.param('id')
    const [row] = await db.select().from(characters).where(
      and(eq(characters.id, id), eq(characters.projectId, projectId)),
    )
    if (!row)
      return c.json(fail('Character not found'), 404)
    return c.json(success(row))
  })

  app.post('/api/projects/:projectId/characters', async (c) => {
    const projectId = c.req.param('projectId')
    const body = await c.req.json()
    const id = generateId()
    const timestamp = now()
    const [row] = await db.insert(characters).values({
      id,
      projectId,
      name: body.name,
      role: body.role,
      goal: body.goal,
      fear: body.fear,
      secret: body.secret,
      desire: body.desire,
      weakness: body.weakness,
      personality: body.personality,
      arc: body.arc,
      createdAt: timestamp,
      updatedAt: timestamp,
    }).returning()
    return c.json(success(row), 201)
  })

  app.patch('/api/projects/:projectId/characters/:id', async (c) => {
    const projectId = c.req.param('projectId')
    const id = c.req.param('id')
    const body = await c.req.json()
    const fields = updatedFields({
      name: body.name,
      role: body.role,
      goal: body.goal,
      fear: body.fear,
      secret: body.secret,
      desire: body.desire,
      weakness: body.weakness,
      personality: body.personality,
      arc: body.arc,
    })
    const [row] = await db.update(characters).set(fields).where(
      and(eq(characters.id, id), eq(characters.projectId, projectId)),
    ).returning()
    if (!row)
      return c.json(fail('Character not found'), 404)
    return c.json(success(row))
  })

  app.delete('/api/projects/:projectId/characters/:id', async (c) => {
    const projectId = c.req.param('projectId')
    const id = c.req.param('id')
    const [row] = await db.delete(characters).where(
      and(eq(characters.id, id), eq(characters.projectId, projectId)),
    ).returning()
    if (!row)
      return c.json({ success: false, error: 'Character not found' }, 404)
    return c.json(success(row, 'Character deleted'))
  })
}
