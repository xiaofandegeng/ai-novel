import type { Context, Hono } from 'hono'
import { DomainCommandError } from '../../eventing'
import { httpCommandOptions } from '../../shared/http/command-options'
import { fail, success } from '../../shared/http/responses'
import { createAct, deleteAct, listActs, updateAct } from './acts.service'
import { CHANGE_ACT_COMMAND, CREATE_ACT_COMMAND, DELETE_ACT_COMMAND } from './story-structure.eventing'

export function registerActRoutes(app: Hono) {
  app.get('/api/projects/:projectId/acts', async (c) => {
    return c.json(success(await listActs(c.req.param('projectId'))))
  })

  app.post('/api/projects/:projectId/acts', async (c) => {
    const projectId = c.req.param('projectId')
    try {
      const row = await createAct(
        projectId,
        await c.req.json(),
        httpCommandOptions(c, CREATE_ACT_COMMAND, projectId),
      )
      return c.json(success(row), 201)
    }
    catch (error: unknown) {
      return actFailure(c, error)
    }
  })

  app.patch('/api/projects/:projectId/acts/:id', async (c) => {
    const projectId = c.req.param('projectId')
    const id = c.req.param('id')
    try {
      const row = await updateAct(
        projectId,
        id,
        await c.req.json(),
        httpCommandOptions(c, CHANGE_ACT_COMMAND, projectId, id),
      )
      return c.json(success(row))
    }
    catch (error: unknown) {
      return actFailure(c, error)
    }
  })

  app.delete('/api/projects/:projectId/acts/:id', async (c) => {
    const projectId = c.req.param('projectId')
    const id = c.req.param('id')
    try {
      const row = await deleteAct(
        projectId,
        id,
        httpCommandOptions(c, DELETE_ACT_COMMAND, projectId, id),
      )
      return c.json(success(row, 'Act deleted'))
    }
    catch (error: unknown) {
      return actFailure(c, error)
    }
  })
}

function actFailure(c: Context, error: unknown): Response {
  if (!(error instanceof DomainCommandError))
    throw error
  if (error.code === 'ACT_NOT_FOUND' || error.code === 'PROJECT_NOT_FOUND')
    return c.json(fail(error.message), 404)
  return c.json(fail(error.message), 400)
}
