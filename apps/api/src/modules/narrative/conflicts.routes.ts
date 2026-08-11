import type { CreateConflictInput, UpdateConflictInput } from '@ai-novel/shared'
import type { Hono } from 'hono'
import { fail, success } from '../../shared/http/responses'
import {
  createConflict,
  deleteConflict,
  listConflictParticipants,
  listConflicts,
  replaceConflictParticipants,
  updateConflict,
} from './conflicts.service'

export function registerConflictRoutes(app: Hono) {
  app.get('/api/projects/:projectId/conflicts', async (c) => {
    return c.json(success(await listConflicts(c.req.param('projectId'))))
  })

  app.post('/api/projects/:projectId/conflicts', async (c) => {
    const row = await createConflict(c.req.param('projectId'), await c.req.json<CreateConflictInput>())
    return c.json(success(row))
  })

  app.patch('/api/projects/:projectId/conflicts/:id', async (c) => {
    const row = await updateConflict(
      c.req.param('projectId'),
      c.req.param('id'),
      await c.req.json<UpdateConflictInput>(),
    )
    return row ? c.json(success(row)) : c.json(fail('Conflict not found'), 404)
  })

  app.delete('/api/projects/:projectId/conflicts/:id', async (c) => {
    const row = await deleteConflict(c.req.param('projectId'), c.req.param('id'))
    return row ? c.json(success(row, 'Conflict deleted')) : c.json(fail('Conflict not found'), 404)
  })

  app.get('/api/projects/:projectId/conflicts/:id/participants', async (c) => {
    const rows = await listConflictParticipants(c.req.param('projectId'), c.req.param('id'))
    return c.json(success(rows))
  })

  app.put('/api/projects/:projectId/conflicts/:id/participants', async (c) => {
    await replaceConflictParticipants(
      c.req.param('projectId'),
      c.req.param('id'),
      await c.req.json(),
    )
    return c.json(success(null, 'Participants updated'))
  })
}
