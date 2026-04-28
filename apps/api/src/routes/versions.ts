import type { Hono } from 'hono'
import { desc, eq } from 'drizzle-orm'
import { db } from '../db'
import { chapterVersions } from '../db/schema'
import { fail, generateId, success } from '../utils'

export function registerVersionRoutes(app: Hono) {
  app.get('/api/projects/:projectId/chapters/:chapterId/versions', (c) => {
    const chapterId = c.req.param('chapterId')
    const rows = db.select().from(chapterVersions).where(eq(chapterVersions.chapterId, chapterId)).orderBy(desc(chapterVersions.createdAt)).all()
    return c.json(success(rows))
  })

  app.post('/api/projects/:projectId/chapters/:chapterId/versions', async (c) => {
    const projectId = c.req.param('projectId')
    const chapterId = c.req.param('chapterId')
    const body = await c.req.json()

    if (!body.content)
      return c.json(fail('Content is required for snapshot'), 400)

    const id = generateId()
    const row = db.insert(chapterVersions).values({
      id,
      projectId,
      chapterId,
      content: body.content,
      wordCount: body.content.length,
      note: body.note || 'Manual snapshot',
    }).returning().get()
    return c.json(success(row))
  })

  app.delete('/api/projects/:projectId/versions/:id', (c) => {
    const id = c.req.param('id')
    const row = db.delete(chapterVersions).where(eq(chapterVersions.id, id)).returning().get()
    if (!row)
      return c.json(fail('Version not found'), 404)
    return c.json(success(row, 'Version deleted'))
  })
}
