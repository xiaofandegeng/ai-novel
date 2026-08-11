import type { Hono } from 'hono'
import { fail, success } from '../../shared/http/responses'
import { errorMessage } from '../../shared/utils'
import { StoryStructureService } from './story-structure.service'

export function registerStoryStructureRoutes(app: Hono) {
  app.get('/api/story-structure/templates', async (c) => {
    const genre = c.req.query('genre')
    const rows = await StoryStructureService.listTemplates(genre)
    return c.json(success(rows))
  })

  app.post('/api/projects/:projectId/story-structure/apply', async (c) => {
    const projectId = c.req.param('projectId')
    const body = await c.req.json()
    if (!body.templateId)
      return c.json(fail('templateId is required'), 400)
    try {
      const acts = await StoryStructureService.applyTemplate(projectId, body.templateId)
      return c.json(success(acts), 201)
    }
    catch (error: unknown) {
      return c.json(fail(errorMessage(error)), 400)
    }
  })
}
