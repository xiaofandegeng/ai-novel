import type { CreateForeshadowingInput, UpdateForeshadowingInput } from '@ai-novel/shared'
import type { Hono } from 'hono'
import { httpCommandOptions } from '../../shared/http/command-options'
import { fail, success } from '../../shared/http/responses'
import {
  CHANGE_FORESHADOWING_COMMAND,
  CREATE_FORESHADOWING_COMMAND,
  DELETE_FORESHADOWING_COMMAND,
  REPLACE_FORESHADOWING_CHARACTERS_COMMAND,
} from './foreshadowing.eventing'
import {
  createForeshadowing,
  deleteForeshadowing,
  listForeshadowing,
  listForeshadowingCharacters,
  replaceForeshadowingCharacters,
  updateForeshadowing,
} from './foreshadowing.service'

export function registerForeshadowingRoutes(app: Hono) {
  app.get('/api/projects/:projectId/foreshadowing', async (c) => {
    return c.json(success(await listForeshadowing(c.req.param('projectId'))))
  })

  app.post('/api/projects/:projectId/foreshadowing', async (c) => {
    const projectId = c.req.param('projectId')
    const row = await createForeshadowing(
      projectId,
      await c.req.json<CreateForeshadowingInput>(),
      httpCommandOptions(c, CREATE_FORESHADOWING_COMMAND, projectId),
    )
    return c.json(success(row), 201)
  })

  app.patch('/api/projects/:projectId/foreshadowing/:id', async (c) => {
    const projectId = c.req.param('projectId')
    const id = c.req.param('id')
    const row = await updateForeshadowing(
      projectId,
      id,
      await c.req.json<UpdateForeshadowingInput>(),
      httpCommandOptions(c, CHANGE_FORESHADOWING_COMMAND, projectId, id),
    )
    return row ? c.json(success(row)) : c.json(fail('Foreshadowing item not found'), 404)
  })

  app.delete('/api/projects/:projectId/foreshadowing/:id', async (c) => {
    const projectId = c.req.param('projectId')
    const id = c.req.param('id')
    const row = await deleteForeshadowing(
      projectId,
      id,
      httpCommandOptions(c, DELETE_FORESHADOWING_COMMAND, projectId, id),
    )
    return row
      ? c.json(success(row, 'Foreshadowing item deleted'))
      : c.json(fail('Foreshadowing item not found'), 404)
  })

  app.get('/api/projects/:projectId/foreshadowing/:id/characters', async (c) => {
    const rows = await listForeshadowingCharacters(c.req.param('projectId'), c.req.param('id'))
    return c.json(success(rows))
  })

  app.put('/api/projects/:projectId/foreshadowing/:id/characters', async (c) => {
    const projectId = c.req.param('projectId')
    const id = c.req.param('id')
    await replaceForeshadowingCharacters(
      projectId,
      id,
      await c.req.json(),
      httpCommandOptions(c, REPLACE_FORESHADOWING_CHARACTERS_COMMAND, projectId, id),
    )
    return c.json(success(null, 'Characters updated'))
  })
}
