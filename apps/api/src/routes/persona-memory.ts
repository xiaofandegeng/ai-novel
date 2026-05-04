import type { Hono } from 'hono'
import { extractStylePatterns, getFragments } from '../services/persona-memory.service'
import { success } from '../utils'

export function registerPersonaMemoryRoutes(app: Hono) {
  app.get('/api/projects/:projectId/persona-memory', async (c) => {
    const projectId = c.req.param('projectId')
    const fragmentType = c.req.query('type')
    const rows = await getFragments(projectId, fragmentType || undefined)
    return c.json(success(rows))
  })

  app.post('/api/projects/:projectId/persona-memory/extract', async (c) => {
    const projectId = c.req.param('projectId')
    const body = await c.req.json()
    const result = await extractStylePatterns(projectId, body.chapterIds)
    return c.json(success(result), 201)
  })
}
