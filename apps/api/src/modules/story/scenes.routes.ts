import type { Hono } from 'hono'
import type { CreateSceneInput, SceneInput, SceneOrderInput } from './scenes.service'
import { fail, success } from '../../shared/http/responses'
import { errorMessage } from '../../shared/utils'
import {
  bulkCreateScenes,
  createScene,
  deleteScene,
  listScenes,
  postprocessScene,
  reorderScenes,
  updateScene,
} from './scenes.service'

export function registerSceneRoutes(app: Hono) {
  app.get('/api/projects/:projectId/chapters/:chapterId/scenes', async (c) => {
    return c.json(success(await listScenes(c.req.param('projectId'), c.req.param('chapterId'))))
  })

  app.post('/api/projects/:projectId/chapters/:chapterId/scenes/bulk', async (c) => {
    const body = await c.req.json<{ scenes: SceneInput[], mode?: 'append' | 'replace' }>()
    if (!Array.isArray(body.scenes) || body.scenes.length === 0)
      return c.json(fail('scenes must be a non-empty array'), 400)
    for (const [index, scene] of body.scenes.entries()) {
      if ((!scene.title || !String(scene.title).trim()) && (!scene.purpose || !String(scene.purpose).trim()))
        return c.json(fail(`Scene at index ${index} must have at least a title or purpose`), 400)
      if (scene.sceneNumber != null && (typeof scene.sceneNumber !== 'number' || scene.sceneNumber < 1))
        return c.json(fail(`Scene at index ${index} has invalid sceneNumber`), 400)
      if (scene.orderIndex != null && (typeof scene.orderIndex !== 'number' || scene.orderIndex < 0))
        return c.json(fail(`Scene at index ${index} has invalid orderIndex`), 400)
    }
    try {
      const rows = await bulkCreateScenes(
        c.req.param('projectId'),
        c.req.param('chapterId'),
        body.scenes,
        body.mode,
      )
      return c.json(success(rows), 201)
    }
    catch (error: unknown) {
      return c.json(fail(`Bulk create failed: ${errorMessage(error)}`), 500)
    }
  })

  app.post('/api/projects/:projectId/chapters/:chapterId/scenes', async (c) => {
    const row = await createScene(
      c.req.param('projectId'),
      c.req.param('chapterId'),
      await c.req.json<CreateSceneInput>(),
    )
    return c.json(success(row), 201)
  })

  app.patch('/api/projects/:projectId/chapters/:chapterId/scenes/reorder', async (c) => {
    const body = await c.req.json<{ orders: SceneOrderInput[] }>()
    if (!Array.isArray(body.orders))
      return c.json(fail('Invalid scene orders'), 400)
    try {
      const rows = await reorderScenes(c.req.param('projectId'), c.req.param('chapterId'), body.orders)
      return c.json(success(rows))
    }
    catch (error: unknown) {
      if (errorMessage(error) === 'SCENE_NOT_FOUND')
        return c.json(fail('Scene not found'), 404)
      throw error
    }
  })

  app.patch('/api/projects/:projectId/chapters/:chapterId/scenes/:id', async (c) => {
    const row = await updateScene(
      c.req.param('projectId'),
      c.req.param('chapterId'),
      c.req.param('id'),
      await c.req.json<SceneInput>(),
    )
    return row ? c.json(success(row)) : c.json(fail('Scene not found'), 404)
  })

  app.post('/api/projects/:projectId/chapters/:chapterId/scenes/:id/postprocess', async (c) => {
    const body = await c.req.json<{ content?: string }>()
    if (!body.content)
      return c.json(fail('场景正文不能为空'), 400)
    try {
      const result = await postprocessScene(
        c.req.param('projectId'),
        c.req.param('chapterId'),
        c.req.param('id'),
        body.content,
      )
      return c.json(success(result))
    }
    catch (error: unknown) {
      return c.json(fail(errorMessage(error)), 500)
    }
  })

  app.delete('/api/projects/:projectId/chapters/:chapterId/scenes/:id', async (c) => {
    const row = await deleteScene(c.req.param('projectId'), c.req.param('chapterId'), c.req.param('id'))
    return row ? c.json(success(row, 'Scene deleted')) : c.json(fail('Scene not found'), 404)
  })
}
