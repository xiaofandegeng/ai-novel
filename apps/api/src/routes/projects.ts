import type { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { db } from '../db'
import { novelProjects } from '../db/schema'
import { fail, generateId, now, success, updatedFields } from '../utils'

export function registerProjectRoutes(app: Hono) {
  app.get('/api/projects', async (c) => {
    const limit = Number(c.req.query('limit') || '50')
    const offset = Number(c.req.query('offset') || '0')
    const rows = await db.select().from(novelProjects).limit(limit).offset(offset)
    return c.json(success(rows))
  })

  app.get('/api/projects/:id', async (c) => {
    const id = c.req.param('id')
    const [row] = await db.select().from(novelProjects).where(eq(novelProjects.id, id))
    if (!row)
      return c.json(fail('Project not found'), 404)
    return c.json(success(row))
  })

  app.post('/api/projects', async (c) => {
    const body = await c.req.json()
    const title = typeof body.title === 'string' ? body.title.trim() : ''
    if (!title)
      return c.json(fail('Project title is required'), 400)

    const id = generateId()
    const timestamp = now()
    const [row] = await db.insert(novelProjects).values({
      id,
      title,
      description: body.description,
      genre: body.genre,
      theme: body.theme,
      targetWords: body.targetWords,
      targetAudience: body.targetAudience,
      styleProfile: body.styleProfile,
      status: body.status ?? 'planning',
      createdAt: timestamp,
      updatedAt: timestamp,
    }).returning()
    return c.json(success(row), 201)
  })

  app.patch('/api/projects/:id', async (c) => {
    const id = c.req.param('id')
    const body = await c.req.json()
    if (body.title !== undefined && (typeof body.title !== 'string' || !body.title.trim()))
      return c.json(fail('Project title is required'), 400)

    const fields = updatedFields({
      title: typeof body.title === 'string' ? body.title.trim() : body.title,
      description: body.description,
      genre: body.genre,
      theme: body.theme,
      targetWords: body.targetWords,
      targetAudience: body.targetAudience,
      styleProfile: body.styleProfile,
      status: body.status,
    })
    const [row] = await db.update(novelProjects).set(fields).where(eq(novelProjects.id, id)).returning()
    if (!row)
      return c.json(fail('Project not found'), 404)
    return c.json(success(row))
  })

  app.delete('/api/projects/:id', async (c) => {
    const id = c.req.param('id')
    const [row] = await db.delete(novelProjects).where(eq(novelProjects.id, id)).returning()
    if (!row)
      return c.json(fail('Project not found'), 404)
    return c.json(success(row, 'Project deleted'))
  })
}
