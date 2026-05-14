import type { Hono } from 'hono'
import { ConflictTimelineService } from '../services/conflict-timeline.service'
import { fail, success } from '../utils'

export function registerConflictTimelineRoutes(app: Hono) {
  app.get('/api/projects/:projectId/conflicts/:conflictId/timeline', async (c) => {
    const projectId = c.req.param('projectId')
    const conflictId = c.req.param('conflictId')
    const rows = await ConflictTimelineService.getConflictTimeline(projectId, conflictId)
    return c.json(success(rows))
  })

  app.get('/api/projects/:projectId/conflict-timeline', async (c) => {
    const projectId = c.req.param('projectId')
    const rows = await ConflictTimelineService.getProjectTimeline(projectId)
    return c.json(success(rows))
  })

  app.post('/api/projects/:projectId/conflict-timeline', async (c) => {
    const projectId = c.req.param('projectId')
    const body = await c.req.json()
    const row = await ConflictTimelineService.createEvent(projectId, body)
    return c.json(success(row))
  })

  app.delete('/api/projects/:projectId/conflict-timeline/:id', async (c) => {
    const projectId = c.req.param('projectId')
    const id = c.req.param('id')
    const row = await ConflictTimelineService.deleteEvent(projectId, id)
    if (!row)
      return c.json(fail('Timeline event not found'), 404)
    return c.json(success(row, 'Timeline event deleted'))
  })
}
