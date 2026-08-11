import type { CreateProjectInput, UpdateProjectInput } from '@ai-novel/shared'
import type { Context, Hono } from 'hono'
import { DomainCommandError } from '../../eventing'
import { fail, success } from '../../shared/http/responses'
import { generateId } from '../../shared/utils'
import {
  CREATE_PROJECT_COMMAND,
  DELETE_PROJECT_COMMAND,
  UPDATE_PROJECT_COMMAND,
} from './project.eventing'
import { createProject, deleteProject, getProject, listProjects, updateProject } from './projects.service'

export function registerProjectRoutes(app: Hono) {
  app.get('/api/projects', async (c) => {
    const limit = Number(c.req.query('limit') || '50')
    const offset = Number(c.req.query('offset') || '0')
    return c.json(success(await listProjects(limit, offset)))
  })

  app.get('/api/projects/:id', async (c) => {
    const row = await getProject(c.req.param('id'))
    return row ? c.json(success(row)) : c.json(fail('Project not found'), 404)
  })

  app.post('/api/projects', async (c) => {
    const body = await c.req.json<CreateProjectInput>()
    const title = typeof body.title === 'string' ? body.title.trim() : ''
    if (!title)
      return c.json(fail('Project title is required'), 400)

    try {
      const row = await createProject(
        { ...body, title },
        commandOptions(c, CREATE_PROJECT_COMMAND),
      )
      return c.json(success(row), 201)
    }
    catch (error: unknown) {
      return projectCommandFailure(c, error)
    }
  })

  app.patch('/api/projects/:id', async (c) => {
    const body = await c.req.json<UpdateProjectInput>()
    if (body.title !== undefined && (typeof body.title !== 'string' || !body.title.trim()))
      return c.json(fail('Project title is required'), 400)

    try {
      const row = await updateProject(
        c.req.param('id'),
        {
          ...body,
          title: typeof body.title === 'string' ? body.title.trim() : body.title,
        },
        commandOptions(c, UPDATE_PROJECT_COMMAND),
      )
      return c.json(success(row))
    }
    catch (error: unknown) {
      return projectCommandFailure(c, error)
    }
  })

  app.delete('/api/projects/:id', async (c) => {
    try {
      const row = await deleteProject(
        c.req.param('id'),
        commandOptions(c, DELETE_PROJECT_COMMAND),
      )
      return c.json(success(row, 'Project deleted'))
    }
    catch (error: unknown) {
      return projectCommandFailure(c, error)
    }
  })
}

function commandOptions(c: Context, commandType: string) {
  const idempotencyKey = c.req.header('Idempotency-Key')?.trim()
  const commandId = idempotencyKey ? `${commandType}:${idempotencyKey}` : generateId()
  return {
    commandId,
    correlationId: c.req.header('X-Correlation-ID')?.trim() || commandId,
  }
}

function projectCommandFailure(c: Context, error: unknown): Response {
  if (!(error instanceof DomainCommandError))
    throw error
  if (error.code === 'PROJECT_NOT_FOUND')
    return c.json(fail('Project not found'), 404)
  return c.json(fail(error.message), 400)
}
