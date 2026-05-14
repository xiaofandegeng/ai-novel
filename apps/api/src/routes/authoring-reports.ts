import type { Hono } from 'hono'
import { AuthoringReportService } from '../services/authoring-report.service'
import { success } from '../utils'

export function registerAuthoringReportRoutes(app: Hono) {
  app.get('/api/authoring-reports/:projectId/weekly', async (c) => {
    const projectId = c.req.param('projectId')

    // Default to last 7 days
    const endDate = new Date()
    const startDate = new Date()
    startDate.setDate(endDate.getDate() - 7)

    const report = await AuthoringReportService.getWeeklyReport(projectId, startDate, endDate)
    return c.json(success(report))
  })
}
