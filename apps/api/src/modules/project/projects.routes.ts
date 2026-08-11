import type { CreateProjectInput, UpdateProjectInput } from '@ai-novel/shared'
import type { Hono } from 'hono'
import { fail, success } from '../../shared/http/responses'
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

    const row = await createProject({ ...body, title })
    return c.json(success(row), 201)
  })

  app.patch('/api/projects/:id', async (c) => {
    const body = await c.req.json<UpdateProjectInput>()
    if (body.title !== undefined && (typeof body.title !== 'string' || !body.title.trim()))
      return c.json(fail('Project title is required'), 400)

    const row = await updateProject(c.req.param('id'), {
      ...body,
      title: typeof body.title === 'string' ? body.title.trim() : body.title,
    })
    return row ? c.json(success(row)) : c.json(fail('Project not found'), 404)
  })

  app.delete('/api/projects/:id', async (c) => {
    const row = await deleteProject(c.req.param('id'))
    return row ? c.json(success(row, 'Project deleted')) : c.json(fail('Project not found'), 404)
  })
}
