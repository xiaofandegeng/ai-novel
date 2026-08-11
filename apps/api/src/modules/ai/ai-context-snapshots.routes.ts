import type { Hono } from 'hono'
import { fail, success } from '../../shared/http/responses'
import { getAIContextSnapshot, listAIContextSnapshots } from './ai-context-snapshot.service'

export function registerAIContextSnapshotRoutes(app: Hono) {
  app.get('/api/projects/:projectId/context-snapshots', async (c) => {
    return c.json(success(await listAIContextSnapshots(c.req.param('projectId'))))
  })

  app.get('/api/projects/:projectId/context-snapshots/:id', async (c) => {
    const row = await getAIContextSnapshot(c.req.param('projectId'), c.req.param('id'))
    return row ? c.json(success(row)) : c.json(fail('Snapshot not found'), 404)
  })
}
