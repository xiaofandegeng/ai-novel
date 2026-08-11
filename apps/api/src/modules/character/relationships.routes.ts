import type { CreateRelationshipInput, UpdateRelationshipInput } from '@ai-novel/shared'
import type { Hono } from 'hono'
import { fail, success } from '../../shared/http/responses'
import { createRelationship, deleteRelationship, listRelationships, updateRelationship } from './relationships.service'

export function registerRelationshipRoutes(app: Hono) {
  app.get('/api/projects/:projectId/relationships', async (c) => {
    return c.json(success(await listRelationships(c.req.param('projectId'))))
  })

  app.post('/api/projects/:projectId/relationships', async (c) => {
    const result = await createRelationship(
      c.req.param('projectId'),
      await c.req.json<CreateRelationshipInput>(),
    )
    return result.error ? c.json(fail(result.error), 400) : c.json(success(result.row))
  })

  app.patch('/api/projects/:projectId/relationships/:id', async (c) => {
    const result = await updateRelationship(
      c.req.param('projectId'),
      c.req.param('id'),
      await c.req.json<UpdateRelationshipInput>(),
    )
    if (result.error)
      return c.json(fail(result.error), 400)
    return result.row ? c.json(success(result.row)) : c.json(fail('Relationship not found'), 404)
  })

  app.delete('/api/projects/:projectId/relationships/:id', async (c) => {
    const row = await deleteRelationship(c.req.param('projectId'), c.req.param('id'))
    return row ? c.json(success(row, 'Relationship deleted')) : c.json(fail('Relationship not found'), 404)
  })
}
