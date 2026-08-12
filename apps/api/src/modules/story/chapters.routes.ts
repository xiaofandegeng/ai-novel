import type { CreateChapterInput, UpdateChapterInput } from '@ai-novel/shared'
import type { Hono } from 'hono'
import { httpCommandOptions } from '../../shared/http/command-options'
import { fail, success } from '../../shared/http/responses'
import { errorMessage } from '../../shared/utils'
import { autoPlanScenesForChapter } from '../automation/auto-repair.service'
import * as postprocessQueries from '../automation/chapter-postprocess.queries'
import * as postprocessService from '../automation/chapter-postprocess.service'
import {
  CHANGE_CHAPTER_COMMAND,
  CREATE_CHAPTER_COMMAND,
  DELETE_CHAPTER_COMMAND,
} from './chapter.eventing'
import { createChapter, deleteChapter, getChapter, listChapters, updateChapter } from './chapters.service'

type PostprocessTrigger = Parameters<typeof postprocessService.runChapterPostprocess>[0]['trigger']

export function registerChapterRoutes(app: Hono) {
  app.get('/api/projects/:projectId/chapters', async (c) => {
    return c.json(success(await listChapters(c.req.param('projectId'))))
  })

  app.get('/api/projects/:projectId/chapters/:id', async (c) => {
    const row = await getChapter(c.req.param('projectId'), c.req.param('id'))
    return row ? c.json(success(row)) : c.json(fail('Chapter not found'), 404)
  })

  app.post('/api/projects/:projectId/chapters', async (c) => {
    const body = await c.req.json<CreateChapterInput>()
    const title = typeof body.title === 'string' ? body.title.trim() : ''
    if (!title)
      return c.json(fail('Chapter title is required'), 400)
    if (!Number.isInteger(body.chapterNumber) || body.chapterNumber < 1)
      return c.json(fail('Chapter number must be a positive integer'), 400)

    const projectId = c.req.param('projectId')
    const result = await createChapter(
      projectId,
      { ...body, title },
      httpCommandOptions(c, CREATE_CHAPTER_COMMAND, projectId),
    )
    return result.error ? c.json(fail(result.error), 400) : c.json(success(result.row), 201)
  })

  app.patch('/api/projects/:projectId/chapters/:id', async (c) => {
    const projectId = c.req.param('projectId')
    const id = c.req.param('id')
    const result = await updateChapter(
      projectId,
      id,
      await c.req.json<UpdateChapterInput>(),
      httpCommandOptions(c, CHANGE_CHAPTER_COMMAND, projectId, id),
    )
    if (result.error)
      return c.json(fail(result.error), result.notFound ? 404 : 400)
    return c.json(success(result.row))
  })

  app.delete('/api/projects/:projectId/chapters/:id', async (c) => {
    const projectId = c.req.param('projectId')
    const id = c.req.param('id')
    const row = await deleteChapter(
      projectId,
      id,
      httpCommandOptions(c, DELETE_CHAPTER_COMMAND, projectId, id),
    )
    return row ? c.json(success(row, 'Chapter deleted')) : c.json(fail('Chapter not found'), 404)
  })

  app.get('/api/projects/:projectId/chapters/:id/memory', async (c) => {
    const memory = await postprocessQueries.getChapterMemory(c.req.param('projectId'), c.req.param('id'))
    return c.json(success(memory))
  })

  app.get('/api/projects/:projectId/memories', async (c) => {
    return c.json(success(await postprocessQueries.getProjectMemories(c.req.param('projectId'))))
  })

  app.get('/api/projects/:projectId/chapters/:id/postprocess-runs', async (c) => {
    const runs = await postprocessQueries.getPostprocessRuns(c.req.param('projectId'), c.req.param('id'))
    return c.json(success(runs))
  })

  app.post('/api/projects/:projectId/chapters/:id/postprocess', async (c) => {
    const body = await c.req.json<{ content?: string, trigger?: PostprocessTrigger }>()
    if (!body.content)
      return c.json(fail('章节正文不能为空'), 400)
    try {
      const result = await postprocessService.runChapterPostprocess({
        projectId: c.req.param('projectId'),
        chapterId: c.req.param('id'),
        content: body.content,
        trigger: body.trigger || 'manual_save',
      })
      return c.json(success(result))
    }
    catch (error: unknown) {
      return c.json(fail(errorMessage(error)), 500)
    }
  })

  app.post('/api/projects/:projectId/chapters/:id/auto-plan-scenes', async (c) => {
    try {
      const result = await autoPlanScenesForChapter(c.req.param('projectId'), c.req.param('id'))
      return c.json(success(result))
    }
    catch (error: unknown) {
      return c.json(fail(errorMessage(error, '一键规划场景失败')), 500)
    }
  })
}
