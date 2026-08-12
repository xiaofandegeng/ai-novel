import type { CreateConflictInput, UpdateConflictInput } from '@ai-novel/shared'
import type { Hono } from 'hono'
import { httpCommandOptions } from '../../shared/http/command-options'
import { fail, success } from '../../shared/http/responses'
import {
  CHANGE_CONFLICT_COMMAND,
  CREATE_CONFLICT_COMMAND,
  DELETE_CONFLICT_COMMAND,
  REPLACE_CONFLICT_PARTICIPANTS_COMMAND,
} from './conflict.eventing'
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
    const projectId = c.req.param('projectId')
    const row = await createConflict(
      projectId,
      await c.req.json<CreateConflictInput>(),
      httpCommandOptions(c, CREATE_CONFLICT_COMMAND, projectId),
    )
    return c.json(success(row))
  })

  app.patch('/api/projects/:projectId/conflicts/:id', async (c) => {
    const projectId = c.req.param('projectId')
    const id = c.req.param('id')
    const row = await updateConflict(
      projectId,
      id,
      await c.req.json<UpdateConflictInput>(),
      httpCommandOptions(c, CHANGE_CONFLICT_COMMAND, projectId, id),
    )
    return row ? c.json(success(row)) : c.json(fail('Conflict not found'), 404)
  })

  app.delete('/api/projects/:projectId/conflicts/:id', async (c) => {
    const projectId = c.req.param('projectId')
    const id = c.req.param('id')
    const row = await deleteConflict(
      projectId,
      id,
      httpCommandOptions(c, DELETE_CONFLICT_COMMAND, projectId, id),
    )
    return row ? c.json(success(row, 'Conflict deleted')) : c.json(fail('Conflict not found'), 404)
  })

  app.get('/api/projects/:projectId/conflicts/:id/participants', async (c) => {
    const rows = await listConflictParticipants(c.req.param('projectId'), c.req.param('id'))
    return c.json(success(rows))
  })

  app.put('/api/projects/:projectId/conflicts/:id/participants', async (c) => {
    const projectId = c.req.param('projectId')
    const id = c.req.param('id')
    await replaceConflictParticipants(
      projectId,
      id,
      await c.req.json(),
      httpCommandOptions(c, REPLACE_CONFLICT_PARTICIPANTS_COMMAND, projectId, id),
    )
    return c.json(success(null, 'Participants updated'))
  })
}
