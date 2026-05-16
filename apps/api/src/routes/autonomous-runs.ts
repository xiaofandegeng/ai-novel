import type { Hono } from 'hono'
import {
  createAutonomousRun,
  getAutonomousExceptions,
  getAutonomousRun,
  getLatestActiveRun,
  ignoreAutonomousException,
  pauseAutonomousRun,
  resolveAutonomousException,
  resumeAutonomousRun,
  startAutonomousRun,
} from '../services/autonomous-writing.service'
import { fail, success } from '../utils'

export function registerAutonomousRunRoutes(app: Hono) {
  app.get('/api/projects/:projectId/autonomous-runs/:runId', async (c) => {
    const projectId = c.req.param('projectId')
    const runId = c.req.param('runId')
    const run = await getAutonomousRun(projectId, runId)
    if (!run)
      return c.json(fail('Run not found'), 404)
    return c.json(success(run))
  })

  app.get('/api/projects/:projectId/autonomous-runs/active', async (c) => {
    const projectId = c.req.param('projectId')
    const run = await getLatestActiveRun(projectId)
    return c.json(success(run || null))
  })

  app.post('/api/projects/:projectId/autonomous-runs', async (c) => {
    const projectId = c.req.param('projectId')
    const body = await c.req.json()
    try {
      const run = await createAutonomousRun(projectId, body)
      return c.json(success(run))
    }
    catch (err: any) {
      return c.json(fail(err.message), 400)
    }
  })

  app.post('/api/projects/:projectId/autonomous-runs/:runId/start', async (c) => {
    const projectId = c.req.param('projectId')
    const runId = c.req.param('runId')
    try {
      await startAutonomousRun(projectId, runId)
      return c.json(success(true))
    }
    catch (err: any) {
      return c.json(fail(err.message), 400)
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
    catch (err: any) {
      return c.json(fail(err.message), 400)
    }
  })

  app.post('/api/projects/:projectId/autonomous-runs/:runId/resume', async (c) => {
    const projectId = c.req.param('projectId')
    const runId = c.req.param('runId')
    try {
      await resumeAutonomousRun(projectId, runId)
      return c.json(success(true))
    }
    catch (err: any) {
      return c.json(fail(err.message), 400)
    }
  })

  app.get('/api/projects/:projectId/autonomous-runs/:runId/exceptions', async (c) => {
    const projectId = c.req.param('projectId')
    const runId = c.req.param('runId')
    const exceptions = await getAutonomousExceptions(projectId, runId)
    return c.json(success(exceptions))
  })

  app.post('/api/projects/:projectId/autonomous-runs/:runId/exceptions/:exceptionId/resolve', async (c) => {
    const projectId = c.req.param('projectId')
    const runId = c.req.param('runId')
    const exceptionId = c.req.param('exceptionId')
    const { resolution } = await c.req.json()
    await resolveAutonomousException(projectId, runId, exceptionId, resolution)
    return c.json(success(true))
  })

  app.post('/api/projects/:projectId/autonomous-runs/:runId/exceptions/:exceptionId/ignore', async (c) => {
    const projectId = c.req.param('projectId')
    const runId = c.req.param('runId')
    const exceptionId = c.req.param('exceptionId')
    await ignoreAutonomousException(projectId, runId, exceptionId)
    return c.json(success(true))
  })

  app.get('/api/projects/:projectId/autonomous-runs/insight', async (c) => {
    const projectId = c.req.param('projectId')
    const { getProjectNarrativeInsight } = await import('../services/autonomous-writing.service')
    const insight = await getProjectNarrativeInsight(projectId)
    return c.json(success(insight))
  })
}
