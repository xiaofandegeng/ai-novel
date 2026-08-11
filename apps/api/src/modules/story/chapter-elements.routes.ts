import type { Hono } from 'hono'
import type { ChapterElementInput, ChapterElementUpdate } from './chapter-elements.service'
import { fail, success } from '../../shared/http/responses'
import {
  createChapterElement,
  deleteChapterElement,
  listChapterElements,
  replaceChapterElements,
  updateChapterElement,
} from './chapter-elements.service'

export function registerChapterElementRoutes(app: Hono) {
  app.get('/api/projects/:projectId/chapters/:chapterId/elements', async (c) => {
    return c.json(success(await listChapterElements(
      c.req.param('projectId'),
      c.req.param('chapterId'),
    )))
  })

  app.put('/api/projects/:projectId/chapters/:chapterId/elements', async (c) => {
    const body = await c.req.json<{ elements?: ChapterElementInput[] }>()
    const result = await replaceChapterElements(
      c.req.param('projectId'),
      c.req.param('chapterId'),
      Array.isArray(body.elements) ? body.elements : [],
    )
    return result.error ? c.json(fail(result.error), 400) : c.json(success(result.row))
  })

  app.post('/api/projects/:projectId/chapters/:chapterId/elements', async (c) => {
    const result = await createChapterElement(
      c.req.param('projectId'),
      c.req.param('chapterId'),
      await c.req.json<ChapterElementInput>(),
    )
    return result.error ? c.json(fail(result.error), 400) : c.json(success(result.row), 201)
  })

  app.patch('/api/projects/:projectId/chapters/:chapterId/elements/:id', async (c) => {
    const result = await updateChapterElement(
      c.req.param('projectId'),
      c.req.param('chapterId'),
      c.req.param('id'),
      await c.req.json<ChapterElementUpdate>(),
    )
    if (result.error)
      return c.json(fail(result.error), result.notFound ? 404 : 400)
    return c.json(success(result.row))
  })

  app.delete('/api/projects/:projectId/chapters/:chapterId/elements/:id', async (c) => {
    const row = await deleteChapterElement(
      c.req.param('projectId'),
      c.req.param('chapterId'),
      c.req.param('id'),
    )
    return row ? c.json(success(row, 'Element deleted')) : c.json(fail('Element not found'), 404)
  })
}
