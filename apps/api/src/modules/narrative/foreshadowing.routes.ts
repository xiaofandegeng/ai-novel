import type { CreateForeshadowingInput, UpdateForeshadowingInput } from '@ai-novel/shared'
import type { Hono } from 'hono'
import { fail, success } from '../../shared/http/responses'
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
    const row = await createForeshadowing(
      c.req.param('projectId'),
      await c.req.json<CreateForeshadowingInput>(),
    )
    return c.json(success(row), 201)
  })

  app.patch('/api/projects/:projectId/foreshadowing/:id', async (c) => {
    const row = await updateForeshadowing(
      c.req.param('projectId'),
      c.req.param('id'),
      await c.req.json<UpdateForeshadowingInput>(),
    )
    return row ? c.json(success(row)) : c.json(fail('Foreshadowing item not found'), 404)
  })

  app.delete('/api/projects/:projectId/foreshadowing/:id', async (c) => {
    const row = await deleteForeshadowing(c.req.param('projectId'), c.req.param('id'))
    return row
      ? c.json(success(row, 'Foreshadowing item deleted'))
      : c.json(fail('Foreshadowing item not found'), 404)
  })

  app.get('/api/projects/:projectId/foreshadowing/:id/characters', async (c) => {
    const rows = await listForeshadowingCharacters(c.req.param('projectId'), c.req.param('id'))
    return c.json(success(rows))
  })

  app.put('/api/projects/:projectId/foreshadowing/:id/characters', async (c) => {
    await replaceForeshadowingCharacters(
      c.req.param('projectId'),
      c.req.param('id'),
      await c.req.json(),
    )
    return c.json(success(null, 'Characters updated'))
  })
}
