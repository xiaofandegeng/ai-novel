import type { Hono } from 'hono'
import type { ChapterElementInput, ChapterElementUpdate } from './chapter-elements.service'
import { httpCommandOptions } from '../../shared/http/command-options'
import { fail, success } from '../../shared/http/responses'
import {
  createChapterElement,
  deleteChapterElement,
  listChapterElements,
  replaceChapterElements,
  updateChapterElement,
} from './chapter-elements.service'
import {
  ADD_CHAPTER_ELEMENT_COMMAND,
  CHANGE_CHAPTER_ELEMENT_COMMAND,
  REMOVE_CHAPTER_ELEMENT_COMMAND,
  REPLACE_CHAPTER_ELEMENTS_COMMAND,
} from './chapter-knowledge.eventing'

export function registerChapterElementRoutes(app: Hono) {
  app.get('/api/projects/:projectId/chapters/:chapterId/elements', async (c) => {
    return c.json(success(await listChapterElements(
      c.req.param('projectId'),
      c.req.param('chapterId'),
    )))
  })

  app.put('/api/projects/:projectId/chapters/:chapterId/elements', async (c) => {
    const projectId = c.req.param('projectId')
    const chapterId = c.req.param('chapterId')
    const body = await c.req.json<{ elements?: ChapterElementInput[] }>()
    const result = await replaceChapterElements(
      projectId,
      chapterId,
      Array.isArray(body.elements) ? body.elements : [],
      httpCommandOptions(c, REPLACE_CHAPTER_ELEMENTS_COMMAND, projectId, chapterId),
    )
    return result.error ? c.json(fail(result.error), 400) : c.json(success(result.row))
  })

  app.post('/api/projects/:projectId/chapters/:chapterId/elements', async (c) => {
    const projectId = c.req.param('projectId')
    const chapterId = c.req.param('chapterId')
    const result = await createChapterElement(
      projectId,
      chapterId,
      await c.req.json<ChapterElementInput>(),
      httpCommandOptions(c, ADD_CHAPTER_ELEMENT_COMMAND, projectId, chapterId),
    )
    return result.error ? c.json(fail(result.error), 400) : c.json(success(result.row), 201)
  })

  app.patch('/api/projects/:projectId/chapters/:chapterId/elements/:id', async (c) => {
    const projectId = c.req.param('projectId')
    const chapterId = c.req.param('chapterId')
    const id = c.req.param('id')
    const result = await updateChapterElement(
      projectId,
      chapterId,
      id,
      await c.req.json<ChapterElementUpdate>(),
      httpCommandOptions(c, CHANGE_CHAPTER_ELEMENT_COMMAND, projectId, chapterId, id),
    )
    if (result.error)
      return c.json(fail(result.error), result.notFound ? 404 : 400)
    return c.json(success(result.row))
  })

  app.delete('/api/projects/:projectId/chapters/:chapterId/elements/:id', async (c) => {
    const projectId = c.req.param('projectId')
    const chapterId = c.req.param('chapterId')
    const id = c.req.param('id')
    const row = await deleteChapterElement(
      projectId,
      chapterId,
      id,
      httpCommandOptions(c, REMOVE_CHAPTER_ELEMENT_COMMAND, projectId, chapterId, id),
    )
    return row ? c.json(success(row, 'Element deleted')) : c.json(fail('Element not found'), 404)
  })
}
