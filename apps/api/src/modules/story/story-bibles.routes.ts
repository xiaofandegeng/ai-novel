import type { CreateStoryBibleInput } from '@ai-novel/shared'
import type { Context, Hono } from 'hono'
import { DomainCommandError } from '../../eventing'
import { httpCommandOptions } from '../../shared/http/command-options'
import { fail, success } from '../../shared/http/responses'
import { createStoryBible, getStoryBible, updateStoryBible } from './story-bibles.service'
import { CHANGE_STORY_BIBLE_COMMAND, CREATE_STORY_BIBLE_COMMAND } from './story-structure.eventing'

export function registerStoryBibleRoutes(app: Hono) {
  app.get('/api/projects/:projectId/story-bible', async (c) => {
    const row = await getStoryBible(c.req.param('projectId'))
    return row ? c.json(success(row)) : c.json(fail('Story bible not found'), 404)
  })

  app.post('/api/projects/:projectId/story-bible', async (c) => {
    const projectId = c.req.param('projectId')
    try {
      const row = await createStoryBible(
        projectId,
        await c.req.json<CreateStoryBibleInput>(),
        httpCommandOptions(c, CREATE_STORY_BIBLE_COMMAND, projectId),
      )
      return c.json(success(row), 201)
    }
    catch (error: unknown) {
      return storyBibleFailure(c, error)
    }
  })

  app.patch('/api/projects/:projectId/story-bible', async (c) => {
    const projectId = c.req.param('projectId')
    try {
      const row = await updateStoryBible(
        projectId,
        await c.req.json<CreateStoryBibleInput>(),
        httpCommandOptions(c, CHANGE_STORY_BIBLE_COMMAND, projectId),
      )
      return c.json(success(row))
    }
    catch (error: unknown) {
      return storyBibleFailure(c, error)
    }
  })
}

function storyBibleFailure(c: Context, error: unknown): Response {
  if (!(error instanceof DomainCommandError))
    throw error
  if (error.code === 'STORY_BIBLE_NOT_FOUND' || error.code === 'PROJECT_NOT_FOUND')
    return c.json(fail(error.message), 404)
  return c.json(fail(error.message), 400)
}
