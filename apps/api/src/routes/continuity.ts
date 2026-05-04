import type { Hono } from 'hono'
import { runContinuityAnalysis } from '../services/continuity.service'
import { success } from '../utils'

export function registerContinuityRoutes(app: Hono) {
  app.post('/api/projects/:projectId/continuity/analyze', async (c) => {
    const projectId = c.req.param('projectId')
    const result = await runContinuityAnalysis(projectId)
    return c.json(success(result))
  })
}
