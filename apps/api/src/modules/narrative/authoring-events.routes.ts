import type { Hono } from 'hono'
import { success } from '../../shared/http/responses'
import { AuthoringEventService } from './authoring-event.service'

export function registerAuthoringEventRoutes(app: Hono) {
  app.get('/api/authoring-events/:projectId', async (c) => {
    const projectId = c.req.param('projectId')
    const events = await AuthoringEventService.getProjectEvents(projectId)
    return c.json(success(events))
  })

  app.post('/api/authoring-events', async (c) => {
    const body = await c.req.json()
    const id = await AuthoringEventService.logEvent(body)
    return c.json(success({ id }))
  })
}
