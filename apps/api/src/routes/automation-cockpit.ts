import type { Hono } from 'hono'
import { AutomationCockpitService } from '../services/automation-cockpit.service'
import { errorMessage, fail, success } from '../utils'

export function registerAutomationCockpitRoutes(app: Hono) {
  // 1. 获取驾驶舱首屏聚合数据
  app.get('/api/projects/:projectId/cockpit', async (c) => {
    const projectId = c.req.param('projectId')
    try {
      const data = await AutomationCockpitService.getCockpitData(projectId)
      return c.json(success(data))
    }
    catch (error: unknown) {
      return c.json(fail(errorMessage(error, '获取驾驶舱数据失败')), 500)
    }
  })

  // 2. 获取回写事件流
  app.get('/api/projects/:projectId/cockpit/events', async (c) => {
    const projectId = c.req.param('projectId')
    const limit = Number(c.req.query('limit') || '100')
    try {
      const events = await AutomationCockpitService.getCockpitEvents(projectId, limit)
      return c.json(success(events))
    }
    catch (error: unknown) {
      return c.json(fail(errorMessage(error, '获取事件流失败')), 500)
    }
  })

  // 3. 获取章节进度详情（正文、大纲、场景）
  app.get('/api/projects/:projectId/cockpit/chapters/:chapterId', async (c) => {
    const { projectId, chapterId } = c.req.param()
    try {
      const detail = await AutomationCockpitService.getCockpitChapterDetail(projectId, chapterId)
      if (!detail) {
        return c.json(fail('未找到该章节详情'), 404)
      }
      return c.json(success(detail))
    }
    catch (error: unknown) {
      return c.json(fail(errorMessage(error, '获取章节详情失败')), 500)
    }
  })

  // 4. 一键修复健康风险
  app.post('/api/projects/:projectId/cockpit/risks/repair', async (c) => {
    const projectId = c.req.param('projectId')
    try {
      const body = await c.req.json()
      const result = await AutomationCockpitService.repairHealthRisk(projectId, body)
      return c.json(success(result))
    }
    catch (error: unknown) {
      return c.json(fail(errorMessage(error, '风险自动修复失败')), 400)
    }
  })
}
