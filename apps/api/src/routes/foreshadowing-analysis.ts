import type { Hono } from 'hono'
import { ForeshadowingRiskService } from '../services/foreshadowing-risk.service'
import { fail, success } from '../utils'

export function registerForeshadowingAnalysisRoutes(app: Hono) {
  app.get('/api/projects/:projectId/foreshadowing-analysis/risks', async (c) => {
    const projectId = c.req.param('projectId')
    try {
      const report = await ForeshadowingRiskService.analyzeRisks(projectId)
      return c.json(success(report))
    }
    catch (error: any) {
      return c.json(fail(`风险分析失败: ${error.message}`), 500)
    }
  })

  app.post('/api/projects/:projectId/foreshadowing-analysis/:id/suggest-payoff', async (c) => {
    const projectId = c.req.param('projectId')
    const id = c.req.param('id')
    try {
      const suggestion = await ForeshadowingRiskService.suggestPayoff(projectId, id)
      return c.json(success(suggestion))
    }
    catch (error: any) {
      return c.json(fail(`建议生成失败: ${error.message}`), 500)
    }
  })
}
