import type { Hono } from 'hono'
import { fail, success } from '../../shared/http/responses'
import { createAct, deleteAct, listActs, updateAct } from './acts.service'

export function registerActRoutes(app: Hono) {
  app.get('/api/projects/:projectId/acts', async (c) => {
    return c.json(success(await listActs(c.req.param('projectId'))))
  })

  app.post('/api/projects/:projectId/acts', async (c) => {
    const row = await createAct(c.req.param('projectId'), await c.req.json())
    return c.json(success(row), 201)
  })

  app.patch('/api/projects/:projectId/acts/:id', async (c) => {
    const row = await updateAct(c.req.param('projectId'), c.req.param('id'), await c.req.json())
    return row ? c.json(success(row)) : c.json(fail('Act not found'), 404)
  })

  app.delete('/api/projects/:projectId/acts/:id', async (c) => {
    const row = await deleteAct(c.req.param('projectId'), c.req.param('id'))
    return row ? c.json(success(row, 'Act deleted')) : c.json(fail('Act not found'), 404)
  })
}
