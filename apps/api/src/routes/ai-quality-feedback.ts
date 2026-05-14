import type { Hono } from 'hono'
import { AIQualityFeedbackService } from '../services/ai-quality-feedback.service'
import { success } from '../utils'

export function registerAIQualityFeedbackRoutes(app: Hono) {
  app.get('/api/ai-quality-feedback/:projectId', async (c) => {
    const projectId = c.req.param('projectId')
    const feedback = await AIQualityFeedbackService.getProjectFeedback(projectId)
    return c.json(success(feedback))
  })

  app.post('/api/ai-quality-feedback', async (c) => {
    const body = await c.req.json()
    const id = await AIQualityFeedbackService.createFeedback(body)
    return c.json(success({ id }))
  })
}
