import type { Hono } from 'hono'
import { and, eq } from 'drizzle-orm'
import { db } from '../db'
import { characters } from '../db/schema'
import { fail, generateId, now, success, updatedFields } from '../utils'

export function registerCharacterRoutes(app: Hono) {
  app.get('/api/projects/:projectId/characters', (c) => {
    const projectId = c.req.param('projectId')
    const rows = db.select().from(characters).where(eq(characters.projectId, projectId)).all()
    return c.json(success(rows))
  })

  app.get('/api/projects/:projectId/characters/:id', (c) => {
    const projectId = c.req.param('projectId')
    const id = c.req.param('id')
    const row = db.select().from(characters).where(
      and(eq(characters.id, id), eq(characters.projectId, projectId)),
    ).get()
    if (!row)
      return c.json(fail('Character not found'), 404)
    return c.json(success(row))
  })

  app.post('/api/projects/:projectId/characters', async (c) => {
    const projectId = c.req.param('projectId')
    const body = await c.req.json()
    const id = generateId()
    const timestamp = now()
    const row = db.insert(characters).values({
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
    }).returning().get()
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
    const row = db.update(characters).set(fields).where(
      and(eq(characters.id, id), eq(characters.projectId, projectId)),
    ).returning().get()
    if (!row)
      return c.json(fail('Character not found'), 404)
    return c.json(success(row))
  })

  app.delete('/api/projects/:projectId/characters/:id', (c) => {
    const projectId = c.req.param('projectId')
    const id = c.req.param('id')
    const row = db.delete(characters).where(
      and(eq(characters.id, id), eq(characters.projectId, projectId)),
    ).returning().get()
    if (!row)
      return c.json({ success: false, error: 'Character not found' }, 404)
    return c.json(success(row, 'Character deleted'))
  })
}
