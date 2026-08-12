import type { AutonomousExceptionAction } from '@ai-novel/shared'
import type { Hono } from 'hono'
import { fail, success } from '../../shared/http/responses'
import { errorMessage } from '../../shared/utils'
import {
  abandonAutonomousRun,
  createAutonomousRun,
  getAutonomousExceptions,
  getAutonomousRun,
  getAutonomousRunInsight,
  getLatestActiveRun,
  getLatestRun,
  pauseAutonomousRun,
  resolveAutonomousExceptionAction,
  resumeAutonomousRun,
  startAutonomousRun,
} from './autonomous-writing.service'

export function registerAutonomousRunRoutes(app: Hono) {
  // Literal routes MUST be registered before :runId to avoid being shadowed
  app.get('/api/projects/:projectId/autonomous-runs/active', async (c) => {
    const projectId = c.req.param('projectId')
    const run = await getLatestActiveRun(projectId)
    return c.json(success(run || null))
  })

  app.get('/api/projects/:projectId/autonomous-runs/latest', async (c) => {
    const projectId = c.req.param('projectId')
    const run = await getLatestRun(projectId)
    return c.json(success(run || null))
  })

  app.get('/api/projects/:projectId/autonomous-runs/insight', async (c) => {
    const projectId = c.req.param('projectId')
    const { getProjectNarrativeInsight } = await import('./autonomous-writing.service')
    const insight = await getProjectNarrativeInsight(projectId)
    return c.json(success(insight))
  })

  app.get('/api/projects/:projectId/autonomous-runs/:runId', async (c) => {
    const projectId = c.req.param('projectId')
    const runId = c.req.param('runId')
    const run = await getAutonomousRun(projectId, runId)
    if (!run)
      return c.json(fail('Run not found'), 404)
    return c.json(success(run))
  })

  app.get('/api/projects/:projectId/autonomous-runs/:runId/insight', async (c) => {
    const projectId = c.req.param('projectId')
    const runId = c.req.param('runId')
    const insight = await getAutonomousRunInsight(projectId, runId)
    return c.json(success(insight))
  })

  app.post('/api/projects/:projectId/autonomous-runs', async (c) => {
    const projectId = c.req.param('projectId')
    const body = await c.req.json()
    try {
      const run = await createAutonomousRun(projectId, body)
      return c.json(success(run))
    }
    catch (error: unknown) {
      return c.json(fail(errorMessage(error)), 400)
    }
  })

  app.post('/api/projects/:projectId/autonomous-runs/:runId/start', async (c) => {
    const projectId = c.req.param('projectId')
    const runId = c.req.param('runId')
    try {
      await startAutonomousRun(projectId, runId)
      return c.json(success(true))
    }
    catch (error: unknown) {
      return c.json(fail(errorMessage(error)), 400)
    }
  })

  app.post('/api/projects/:projectId/autonomous-runs/:runId/pause', async (c) => {
    const projectId = c.req.param('projectId')
    const runId = c.req.param('runId')
    const { reason } = await c.req.json().catch(() => ({ reason: undefined }))
    try {
      await pauseAutonomousRun(projectId, runId, reason)
      return c.json(success(true))
    }
    catch (error: unknown) {
      return c.json(fail(errorMessage(error)), 400)
    }
  })

  app.post('/api/projects/:projectId/autonomous-runs/:runId/resume', async (c) => {
    const projectId = c.req.param('projectId')
    const runId = c.req.param('runId')
    try {
      await resumeAutonomousRun(projectId, runId)
      return c.json(success(true))
    }
    catch (error: unknown) {
      return c.json(fail(errorMessage(error)), 400)
    }
  })

  app.post('/api/projects/:projectId/autonomous-runs/:runId/abandon', async (c) => {
    const projectId = c.req.param('projectId')
    const runId = c.req.param('runId')
    try {
      await abandonAutonomousRun(projectId, runId)
      return c.json(success(true))
    }
    catch (error: unknown) {
      return c.json(fail(errorMessage(error)), 400)
    }
  })

  app.get('/api/projects/:projectId/autonomous-runs/:runId/exceptions', async (c) => {
    const projectId = c.req.param('projectId')
    const runId = c.req.param('runId')
    const exceptions = await getAutonomousExceptions(projectId, runId)
    return c.json(success(exceptions))
  })

  app.post('/api/projects/:projectId/autonomous-runs/:runId/exceptions/:exceptionId/actions', async (c) => {
    const projectId = c.req.param('projectId')
    const runId = c.req.param('runId')
    const exceptionId = c.req.param('exceptionId')
    try {
      const { action } = await c.req.json<{ action: AutonomousExceptionAction }>()
      await resolveAutonomousExceptionAction(projectId, runId, exceptionId, action)
      return c.json(success(true))
    }
    catch (error: unknown) {
      return c.json(fail(errorMessage(error)), 400)
    }
  })
}
