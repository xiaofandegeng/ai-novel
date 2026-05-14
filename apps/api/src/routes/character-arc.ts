import type { Hono } from 'hono'
import { CharacterArcService } from '../services/character-arc.service'
import { fail, success } from '../utils'

export function registerCharacterArcRoutes(app: Hono) {
  app.get('/api/projects/:projectId/character-arc/:characterId', async (c) => {
    const projectId = c.req.param('projectId')
    const characterId = c.req.param('characterId')
    try {
      const rows = await CharacterArcService.getCharacterTimeline(projectId, characterId)
      return c.json(success(rows))
    }
    catch (e: any) {
      return c.json(fail(e.message || '获取角色弧光时间线失败'), 500)
    }
  })

  app.get('/api/projects/:projectId/character-arc', async (c) => {
    const projectId = c.req.param('projectId')
    try {
      const rows = await CharacterArcService.getProjectTimeline(projectId)
      return c.json(success(rows))
    }
    catch (e: any) {
      return c.json(fail(e.message || '获取项目弧光时间线失败'), 500)
    }
  })

  app.post('/api/projects/:projectId/character-arc', async (c) => {
    const projectId = c.req.param('projectId')
    const body = await c.req.json()
    try {
      const row = await CharacterArcService.createEvent(projectId, {
        characterId: body.characterId,
        chapterId: body.chapterId,
        sceneId: body.sceneId,
        eventType: body.eventType,
        beforeState: body.beforeState,
        afterState: body.afterState,
        motivationChange: body.motivationChange,
        relationshipImpact: body.relationshipImpact,
        evidence: body.evidence,
        sourceType: body.sourceType,
      })
      return c.json(success(row), 201)
    }
    catch (e: any) {
      return c.json(fail(e.message || '创建弧光事件失败'), 500)
    }
  })

  app.patch('/api/projects/:projectId/character-arc/:id', async (c) => {
    const projectId = c.req.param('projectId')
    const id = c.req.param('id')
    const body = await c.req.json()
    try {
      const row = await CharacterArcService.updateEvent(projectId, id, {
        eventType: body.eventType,
        chapterId: body.chapterId,
        sceneId: body.sceneId,
        beforeState: body.beforeState,
        afterState: body.afterState,
        motivationChange: body.motivationChange,
        relationshipImpact: body.relationshipImpact,
        evidence: body.evidence,
      })
      if (!row)
        return c.json(fail('弧光事件不存在'), 404)
      return c.json(success(row))
    }
    catch (e: any) {
      return c.json(fail(e.message || '更新弧光事件失败'), 500)
    }
  })

  app.delete('/api/projects/:projectId/character-arc/:id', async (c) => {
    const projectId = c.req.param('projectId')
    const id = c.req.param('id')
    try {
      const row = await CharacterArcService.deleteEvent(projectId, id)
      if (!row)
        return c.json(fail('弧光事件不存在'), 404)
      return c.json(success(row, '弧光事件已删除'))
    }
    catch (e: any) {
      return c.json(fail(e.message || '删除弧光事件失败'), 500)
    }
  })
}
