import type { Hono } from 'hono'
import { exportProjectData, importProjectData } from '../services/export-import.service'
import { success } from '../utils'

export function registerDataPortabilityRoutes(app: Hono) {
  app.get('/api/projects/:projectId/export', async (c) => {
    const projectId = c.req.param('projectId')
    const data = await exportProjectData(projectId)
    return c.json(success(data))
  })

  app.post('/api/projects/import', async (c) => {
    const body = await c.req.json()
    if (!body.project)
      return c.json({ success: false, error: 'Invalid import data' }, 400)
    const result = await importProjectData(body)
    return c.json(success(result), 201)
  })
}
