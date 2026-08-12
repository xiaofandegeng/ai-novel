import type { Hono } from 'hono'
import { httpCommandOptions } from '../../shared/http/command-options'
import { success } from '../../shared/http/responses'
import { AuthoringEventService } from './authoring-event.service'
import { RECORD_AUTHORING_EVENT_COMMAND } from './narrative-knowledge.eventing'

export function registerAuthoringEventRoutes(app: Hono) {
  app.get('/api/authoring-events/:projectId', async (c) => {
    const projectId = c.req.param('projectId')
    const events = await AuthoringEventService.getProjectEvents(projectId)
    return c.json(success(events))
  })

  app.post('/api/authoring-events', async (c) => {
    const body = await c.req.json()
    const id = await AuthoringEventService.logEvent(
      body,
      httpCommandOptions(c, RECORD_AUTHORING_EVENT_COMMAND, body.projectId),
    )
    return c.json(success({ id }))
  })
}
