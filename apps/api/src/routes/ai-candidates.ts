import type { Hono } from 'hono'
import { AICandidateService } from '../services/ai-candidate.service'
import { fail, success } from '../utils'

export function registerAICandidateRoutes(app: Hono) {
  // List candidates with optional filters
  app.get('/api/projects/:projectId/ai-candidates', async (c) => {
    const projectId = c.req.param('projectId')
    const chapterId = c.req.query('chapterId')
    const taskType = c.req.query('taskType')

    try {
      const candidates = await AICandidateService.getCandidates(projectId, { chapterId, taskType })
      return c.json(success(candidates))
    }
    catch {
      return c.json(fail('获取候选结果失败'), 500)
    }
  })

  // Create a new candidate
  app.post('/api/projects/:projectId/ai-candidates', async (c) => {
    const projectId = c.req.param('projectId')
    const body = await c.req.json()

    try {
      const candidate = await AICandidateService.createCandidate(projectId, body)
      return c.json(success(candidate))
    }
    catch {
      return c.json(fail('创建候选结果失败'), 500)
    }
  })

  // Select a candidate
  app.post('/api/projects/:projectId/ai-candidates/:id/select', async (c) => {
    const projectId = c.req.param('projectId')
    const id = c.req.param('id')

    try {
      const candidate = await AICandidateService.selectCandidate(projectId, id)
      if (!candidate)
        return c.json(fail('候选结果不存在'), 404)
      return c.json(success(candidate))
    }
    catch {
      return c.json(fail('选择候选结果失败'), 500)
    }
  })

  // Rate a candidate
  app.post('/api/projects/:projectId/ai-candidates/:id/rate', async (c) => {
    const projectId = c.req.param('projectId')
    const id = c.req.param('id')
    const { rating } = await c.req.json()

    if (typeof rating !== 'number' || rating < 1 || rating > 5) {
      return c.json(fail('评分必须在 1-5 之间'), 400)
    }

    try {
      const candidate = await AICandidateService.rateCandidate(projectId, id, rating)
      if (!candidate)
        return c.json(fail('候选结果不存在'), 404)
      return c.json(success(candidate))
    }
    catch {
      return c.json(fail('评分失败'), 500)
    }
  })
}
