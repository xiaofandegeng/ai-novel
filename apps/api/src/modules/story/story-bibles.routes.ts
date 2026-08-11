import type { CreateStoryBibleInput } from '@ai-novel/shared'
import type { Hono } from 'hono'
import { fail, success } from '../../shared/http/responses'
import { createStoryBible, getStoryBible, updateStoryBible } from './story-bibles.service'

export function registerStoryBibleRoutes(app: Hono) {
  app.get('/api/projects/:projectId/story-bible', async (c) => {
    const row = await getStoryBible(c.req.param('projectId'))
    return row ? c.json(success(row)) : c.json(fail('Story bible not found'), 404)
  })

  app.post('/api/projects/:projectId/story-bible', async (c) => {
    const row = await createStoryBible(
      c.req.param('projectId'),
      await c.req.json<CreateStoryBibleInput>(),
    )
    return c.json(success(row), 201)
  })

  app.patch('/api/projects/:projectId/story-bible', async (c) => {
    const row = await updateStoryBible(
      c.req.param('projectId'),
      await c.req.json<CreateStoryBibleInput>(),
    )
    return row ? c.json(success(row)) : c.json(fail('Story bible not found'), 404)
  })
}
