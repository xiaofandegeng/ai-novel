import type { Hono } from 'hono'
import { applyTemplate, listTemplates } from '../services/story-structure.service'
import { fail, success } from '../utils'

export function registerStoryStructureRoutes(app: Hono) {
  app.get('/api/story-structure/templates', async (c) => {
    const genre = c.req.query('genre')
    const rows = await listTemplates(genre)
    return c.json(success(rows))
  })

  app.post('/api/projects/:projectId/story-structure/apply', async (c) => {
    const projectId = c.req.param('projectId')
    const body = await c.req.json()
    if (!body.templateId)
      return c.json(fail('templateId is required'), 400)
    try {
      const acts = await applyTemplate(projectId, body.templateId)
      return c.json(success(acts), 201)
    }
    catch (e: any) {
      return c.json(fail(e.message), 400)
    }
  })
}
