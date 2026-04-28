import type { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { db } from '../db'
import { storyBibles } from '../db/schema'
import { fail, generateId, now, success, updatedFields } from '../utils'

export function registerStoryBibleRoutes(app: Hono) {
  app.get('/api/projects/:projectId/story-bible', (c) => {
    const projectId = c.req.param('projectId')
    const row = db.select().from(storyBibles).where(eq(storyBibles.projectId, projectId)).get()
    if (!row)
      return c.json(fail('Story bible not found'), 404)
    return c.json(success(row))
  })

  app.post('/api/projects/:projectId/story-bible', async (c) => {
    const projectId = c.req.param('projectId')
    const body = await c.req.json()
    const id = generateId()
    const timestamp = now()
    const row = db.insert(storyBibles).values({
      id,
      projectId,
      worldview: body.worldview,
      mainConflict: body.mainConflict,
      theme: body.theme,
      rules: body.rules,
      timeline: body.timeline,
      createdAt: timestamp,
      updatedAt: timestamp,
    }).returning().get()
    return c.json(success(row), 201)
  })

  app.patch('/api/projects/:projectId/story-bible', async (c) => {
    const projectId = c.req.param('projectId')
    const body = await c.req.json()
    const fields = updatedFields({
      worldview: body.worldview,
      mainConflict: body.mainConflict,
      theme: body.theme,
      rules: body.rules,
      timeline: body.timeline,
    })
    const row = db.update(storyBibles).set(fields).where(eq(storyBibles.projectId, projectId)).returning().get()
    if (!row)
      return c.json(fail('Story bible not found'), 404)
    return c.json(success(row))
  })
}
