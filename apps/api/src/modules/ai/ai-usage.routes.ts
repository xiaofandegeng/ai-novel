import type { Hono } from 'hono'
import { success } from '../../shared/http/responses'
import { AIUsageService } from './ai-usage.service'

export function registerAIUsageRoutes(app: Hono) {
  app.get('/api/ai-usage/:projectId', async (c) => {
    const projectId = c.req.param('projectId')
    const usage = await AIUsageService.getProjectUsageStats(projectId)
    return c.json(success(usage))
  })
}
