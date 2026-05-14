import type { Hono } from 'hono'
import { WritingGoalsService } from '../services/writing-goals.service'
import { fail, success } from '../utils'

export function registerWritingGoalRoutes(app: Hono) {
  app.get('/api/projects/:projectId/writing-goals', async (c) => {
    const projectId = c.req.param('projectId')
    const goals = await WritingGoalsService.getGoals(projectId)
    return c.json(success(goals))
  })

  app.get('/api/projects/:projectId/writing-goals/active', async (c) => {
    const projectId = c.req.param('projectId')
    const goals = await WritingGoalsService.getActiveGoals(projectId)
    return c.json(success(goals))
  })

  app.post('/api/projects/:projectId/writing-goals', async (c) => {
    const projectId = c.req.param('projectId')
    const body = await c.req.json()
    if (!body.goalType || !body.startDate)
      return c.json(fail('goalType and startDate are required'), 400)
    const goal = await WritingGoalsService.createGoal(projectId, body)
    return c.json(success(goal), 201)
  })

  app.get('/api/projects/:projectId/writing-goals/:id/progress', async (c) => {
    const projectId = c.req.param('projectId')
    const id = c.req.param('id')
    const progress = await WritingGoalsService.getGoalProgress(projectId, id)
    if (!progress)
      return c.json(fail('Goal not found'), 404)
    return c.json(success(progress))
  })

  app.patch('/api/projects/:projectId/writing-goals/:id', async (c) => {
    const projectId = c.req.param('projectId')
    const id = c.req.param('id')
    const body = await c.req.json()
    const goal = await WritingGoalsService.updateGoal(projectId, id, body)
    if (!goal)
      return c.json(fail('Goal not found'), 404)
    return c.json(success(goal))
  })

  app.delete('/api/projects/:projectId/writing-goals/:id', async (c) => {
    const projectId = c.req.param('projectId')
    const id = c.req.param('id')
    const goal = await WritingGoalsService.deleteGoal(projectId, id)
    if (!goal)
      return c.json(fail('Goal not found'), 404)
    return c.json(success(goal, 'Goal deleted'))
  })

  app.get('/api/projects/:projectId/daily-stats', async (c) => {
    const projectId = c.req.param('projectId')
    const startDate = c.req.query('startDate')
    const endDate = c.req.query('endDate')
    const stats = await WritingGoalsService.getDailyStats(projectId, startDate, endDate)
    return c.json(success(stats))
  })

  app.post('/api/projects/:projectId/daily-stats', async (c) => {
    const projectId = c.req.param('projectId')
    const body = await c.req.json()
    if (!body.date)
      return c.json(fail('date is required'), 400)
    const stat = await WritingGoalsService.recordWritingActivity(projectId, body)
    return c.json(success(stat))
  })
}
