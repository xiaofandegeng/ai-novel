import type { CreateRelationshipInput, UpdateRelationshipInput } from '@ai-novel/shared'
import type { Hono } from 'hono'
import { httpCommandOptions } from '../../shared/http/command-options'
import { fail, success } from '../../shared/http/responses'
import {
  CHANGE_RELATIONSHIP_COMMAND,
  CREATE_RELATIONSHIP_COMMAND,
  DELETE_RELATIONSHIP_COMMAND,
} from './relationship.eventing'
import { createRelationship, deleteRelationship, listRelationships, updateRelationship } from './relationships.service'

export function registerRelationshipRoutes(app: Hono) {
  app.get('/api/projects/:projectId/relationships', async (c) => {
    return c.json(success(await listRelationships(c.req.param('projectId'))))
  })

  app.post('/api/projects/:projectId/relationships', async (c) => {
    const projectId = c.req.param('projectId')
    const result = await createRelationship(
      projectId,
      await c.req.json<CreateRelationshipInput>(),
      httpCommandOptions(c, CREATE_RELATIONSHIP_COMMAND, projectId),
    )
    return result.error ? c.json(fail(result.error), 400) : c.json(success(result.row))
  })

  app.patch('/api/projects/:projectId/relationships/:id', async (c) => {
    const projectId = c.req.param('projectId')
    const id = c.req.param('id')
    const result = await updateRelationship(
      projectId,
      id,
      await c.req.json<UpdateRelationshipInput>(),
      httpCommandOptions(c, CHANGE_RELATIONSHIP_COMMAND, projectId, id),
    )
    if (result.error)
      return c.json(fail(result.error), 400)
    return result.row ? c.json(success(result.row)) : c.json(fail('Relationship not found'), 404)
  })

  app.delete('/api/projects/:projectId/relationships/:id', async (c) => {
    const projectId = c.req.param('projectId')
    const id = c.req.param('id')
    const row = await deleteRelationship(
      projectId,
      id,
      httpCommandOptions(c, DELETE_RELATIONSHIP_COMMAND, projectId, id),
    )
    return row ? c.json(success(row, 'Relationship deleted')) : c.json(fail('Relationship not found'), 404)
  })
}
