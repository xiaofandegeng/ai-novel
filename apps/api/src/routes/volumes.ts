import type { Hono } from 'hono'
import { and, eq } from 'drizzle-orm'
import { db } from '../db'
import { volumes } from '../db/schema'
import { fail, generateId, now, success, updatedFields } from '../utils'

export function registerVolumeRoutes(app: Hono) {
  app.get('/api/projects/:projectId/volumes', (c) => {
    const projectId = c.req.param('projectId')
    const rows = db.select().from(volumes).where(eq(volumes.projectId, projectId)).all()
    return c.json(success(rows))
  })

  app.get('/api/projects/:projectId/volumes/:id', (c) => {
    const projectId = c.req.param('projectId')
    const id = c.req.param('id')
    const row = db.select().from(volumes).where(
      and(eq(volumes.id, id), eq(volumes.projectId, projectId)),
    ).get()
    if (!row)
      return c.json(fail('Volume not found'), 404)
    return c.json(success(row))
  })

  app.post('/api/projects/:projectId/volumes', async (c) => {
    const projectId = c.req.param('projectId')
    const body = await c.req.json()
    const id = generateId()
    const timestamp = now()
    const row = db.insert(volumes).values({
      id,
      projectId,
      title: body.title,
      summary: body.summary,
      orderIndex: body.orderIndex ?? 0,
      createdAt: timestamp,
      updatedAt: timestamp,
    }).returning().get()
    return c.json(success(row), 201)
  })

  app.patch('/api/projects/:projectId/volumes/:id', async (c) => {
    const projectId = c.req.param('projectId')
    const id = c.req.param('id')
    const body = await c.req.json()
    const fields = updatedFields({
      title: body.title,
      summary: body.summary,
      orderIndex: body.orderIndex,
    })
    const row = db.update(volumes).set(fields).where(
      and(eq(volumes.id, id), eq(volumes.projectId, projectId)),
    ).returning().get()
    if (!row)
      return c.json(fail('Volume not found'), 404)
    return c.json(success(row))
  })

  app.delete('/api/projects/:projectId/volumes/:id', (c) => {
    const projectId = c.req.param('projectId')
    const id = c.req.param('id')
    const row = db.delete(volumes).where(
      and(eq(volumes.id, id), eq(volumes.projectId, projectId)),
    ).returning().get()
    if (!row)
      return c.json(fail('Volume not found'), 404)
    return c.json(success(row, 'Volume deleted'))
  })
}
