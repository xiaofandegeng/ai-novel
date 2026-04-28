import type { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { db } from '../db'
import { novelProjects } from '../db/schema'
import { fail, generateId, now, success, updatedFields } from '../utils'

export function registerProjectRoutes(app: Hono) {
  app.get('/api/projects', (c) => {
    const rows = db.select().from(novelProjects).all()
    return c.json(success(rows))
  })

  app.get('/api/projects/:id', (c) => {
    const id = c.req.param('id')
    const row = db.select().from(novelProjects).where(eq(novelProjects.id, id)).get()
    if (!row)
      return c.json(fail('Project not found'), 404)
    return c.json(success(row))
  })

  app.post('/api/projects', async (c) => {
    const body = await c.req.json()
    const id = generateId()
    const timestamp = now()
    const row = db.insert(novelProjects).values({
      id,
      title: body.title,
      description: body.description,
      genre: body.genre,
      theme: body.theme,
      targetWords: body.targetWords,
      targetAudience: body.targetAudience,
      styleProfile: body.styleProfile,
      status: body.status ?? 'planning',
      createdAt: timestamp,
      updatedAt: timestamp,
    }).returning().get()
    return c.json(success(row), 201)
  })

  app.patch('/api/projects/:id', async (c) => {
    const id = c.req.param('id')
    const body = await c.req.json()
    const fields = updatedFields({
      title: body.title,
      description: body.description,
      genre: body.genre,
      theme: body.theme,
      targetWords: body.targetWords,
      targetAudience: body.targetAudience,
      styleProfile: body.styleProfile,
      status: body.status,
    })
    const row = db.update(novelProjects).set(fields).where(eq(novelProjects.id, id)).returning().get()
    if (!row)
      return c.json(fail('Project not found'), 404)
    return c.json(success(row))
  })

  app.delete('/api/projects/:id', (c) => {
    const id = c.req.param('id')
    const row = db.delete(novelProjects).where(eq(novelProjects.id, id)).returning().get()
    if (!row)
      return c.json(fail('Project not found'), 404)
    return c.json(success(row, 'Project deleted'))
  })
}
