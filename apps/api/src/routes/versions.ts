import type { Hono } from 'hono'
import * as versionService from '../services/version.service'
import { fail, success } from '../utils'

export function registerVersionRoutes(app: Hono) {
  app.get('/api/projects/:projectId/chapters/:chapterId/versions', async (c) => {
    const projectId = c.req.param('projectId')
    const chapterId = c.req.param('chapterId')
    const rows = await versionService.listChapterVersions(projectId, chapterId)
    return c.json(success(rows))
  })

  app.post('/api/projects/:projectId/chapters/:chapterId/versions', async (c) => {
    const projectId = c.req.param('projectId')
    const chapterId = c.req.param('chapterId')
    const body = await c.req.json()

    if (!body.content)
      return c.json(fail('Content is required for snapshot'), 400)

    const row = await versionService.createSnapshot(projectId, chapterId, body.content, body.note)
    if (typeof row === 'object' && 'error' in row && row.error)
      return c.json(fail(row.error), 400)
    return c.json(success(row))
  })

  app.delete('/api/projects/:projectId/versions/:id', async (c) => {
    const projectId = c.req.param('projectId')
    const id = c.req.param('id')
    const row = await versionService.deleteVersion(projectId, id)
    if (typeof row === 'object' && 'error' in row && row.error)
      return c.json(fail('Version not found'), 404)
    return c.json(success(row, 'Version deleted'))
  })
}
