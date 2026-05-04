import type { Hono } from 'hono'
import { getProjectHealthMetrics } from '../services/health-metrics.service'

export function registerHealthMetricsRoutes(app: Hono) {
  app.get('/api/projects/:projectId/health-metrics', async (c) => {
    const projectId = c.req.param('projectId')
    const metrics = await getProjectHealthMetrics(projectId)
    return c.json({ success: true, data: metrics })
  })
}
