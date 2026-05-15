import type { Hono } from 'hono'
import {
  createAutonomousRun,
  getAutonomousRun,
  pauseAutonomousRun,
  resumeAutonomousRun,
  startAutonomousRun,
} from '../services/autonomous-writing.service'

export function registerAutonomousRunRoutes(app: Hono) {
  app.get('/api/projects/:projectId/autonomous-runs/:runId', async (c) => {
    const projectId = c.req.param('projectId')
    const runId = c.req.param('runId')
    const run = await getAutonomousRun(projectId, runId)
    if (!run)
      return c.json({ error: 'Run not found' }, 404)
    return c.json(run)
  })

  app.post('/api/projects/:projectId/autonomous-runs', async (c) => {
    const projectId = c.req.param('projectId')
    const body = await c.req.json()
    const run = await createAutonomousRun(projectId, body)
    return c.json(run)
  })

  app.post('/api/projects/:projectId/autonomous-runs/:runId/start', async (c) => {
    const projectId = c.req.param('projectId')
    const runId = c.req.param('runId')
    await startAutonomousRun(projectId, runId)
    return c.json({ success: true })
  })

  app.post('/api/projects/:projectId/autonomous-runs/:runId/pause', async (c) => {
    const projectId = c.req.param('projectId')
    const runId = c.req.param('runId')
    const { reason } = await c.req.json().catch(() => ({ reason: undefined }))
    await pauseAutonomousRun(projectId, runId, reason)
    return c.json({ success: true })
  })

  app.post('/api/projects/:projectId/autonomous-runs/:runId/resume', async (c) => {
    const projectId = c.req.param('projectId')
    const runId = c.req.param('runId')
    await resumeAutonomousRun(projectId, runId)
    return c.json({ success: true })
  })
}
