import type { CreateCharacterInput, UpdateCharacterInput } from '@ai-novel/shared'
import type { Hono } from 'hono'
import { fail, success } from '../../shared/http/responses'
import { errorMessage } from '../../shared/utils'
import { autoLinkCharacterToGraph } from './character-auto-link.service'
import { inferRelationshipsFromBios } from './character-inference.service'
import { createCharacter, deleteCharacter, getCharacter, listCharacters, updateCharacter } from './characters.service'

export function registerCharacterRoutes(app: Hono) {
  app.post('/api/projects/:projectId/characters/infer-relationships', async (c) => {
    try {
      return c.json(success(await inferRelationshipsFromBios(c.req.param('projectId'))))
    }
    catch (error: unknown) {
      return c.json(fail(errorMessage(error, '推导失败')), 500)
    }
  })

  app.post('/api/projects/:projectId/characters/:id/auto-link', async (c) => {
    try {
      const result = await autoLinkCharacterToGraph(c.req.param('projectId'), c.req.param('id'))
      return c.json(success(result))
    }
    catch (error: unknown) {
      return c.json(fail(errorMessage(error, '自动关联关系网失败')), 500)
    }
  })

  app.get('/api/projects/:projectId/characters', async (c) => {
    return c.json(success(await listCharacters(c.req.param('projectId'))))
  })

  app.get('/api/projects/:projectId/characters/:id', async (c) => {
    const row = await getCharacter(c.req.param('projectId'), c.req.param('id'))
    return row ? c.json(success(row)) : c.json(fail('Character not found'), 404)
  })

  app.post('/api/projects/:projectId/characters', async (c) => {
    const row = await createCharacter(
      c.req.param('projectId'),
      await c.req.json<CreateCharacterInput>(),
    )
    return c.json(success(row), 201)
  })

  app.patch('/api/projects/:projectId/characters/:id', async (c) => {
    const row = await updateCharacter(
      c.req.param('projectId'),
      c.req.param('id'),
      await c.req.json<UpdateCharacterInput>(),
    )
    return row ? c.json(success(row)) : c.json(fail('Character not found'), 404)
  })

  app.delete('/api/projects/:projectId/characters/:id', async (c) => {
    const row = await deleteCharacter(c.req.param('projectId'), c.req.param('id'))
    return row ? c.json(success(row, 'Character deleted')) : c.json(fail('Character not found'), 404)
  })
}
