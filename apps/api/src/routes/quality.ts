import type { Hono } from 'hono'
import * as qualityService from '../services/quality.service'
import { fail, success } from '../utils'

export function registerQualityRoutes(app: Hono) {
  app.get('/api/projects/:projectId/quality/reports', async (c) => {
    const projectId = c.req.param('projectId')
    const reports = await qualityService.listReports(projectId)
    return c.json(success(reports))
  })

  app.post('/api/projects/:projectId/chapters/:chapterId/quality-check', async (c) => {
    const projectId = c.req.param('projectId')
    const chapterId = c.req.param('chapterId')

    const result = await qualityService.runChapterQualityCheck(projectId, chapterId)
    if (typeof result === 'object' && 'error' in result && result.error)
      return c.json(fail(result.error), 400)
    return c.json(success(result))
  })

  app.get('/api/projects/:projectId/quality/reports/:id', async (c) => {
    const projectId = c.req.param('projectId')
    const id = c.req.param('id')
    const report = await qualityService.getReport(projectId, id)
    if (typeof report === 'object' && 'error' in report && report.error)
      return c.json(fail(report.error), 404)
    return c.json(success(report))
  })
}
