import type { Hono } from 'hono'
import { AIUsageService } from '../services/ai-usage.service'
import { success } from '../utils'

export function registerAIUsageRoutes(app: Hono) {
  app.get('/api/ai-usage/:projectId', async (c) => {
    const projectId = c.req.param('projectId')
    const usage = await AIUsageService.getProjectUsageStats(projectId)
    return c.json(success(usage))
  })
}
