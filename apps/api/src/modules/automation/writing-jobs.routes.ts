import type { CreateWritingJobInput } from '@ai-novel/shared'
import type { Hono } from 'hono'
import { fail, success } from '../../shared/http/responses'
import { errorMessage } from '../../shared/utils'
import {
  continueWritingJob,
  createWritingJob,
  deleteWritingJob,
  getJobSteps,
  getLatestWritingJob,
  getProjectJobSteps,
  getWritingJob,
  pauseWritingJob,
  retryStep,
  startJob,
} from './writing-job.service'

export function registerWritingJobRoutes(app: Hono) {
  app.get('/api/projects/:projectId/writing-jobs', async (c) => {
    return c.json(success(await getLatestWritingJob(c.req.param('projectId'))))
  })

  app.get('/api/projects/:projectId/writing-jobs/:id', async (c) => {
    const row = await getWritingJob(c.req.param('projectId'), c.req.param('id'))
    return row ? c.json(success(row)) : c.json(fail('Job not found'), 404)
  })

  app.post('/api/projects/:projectId/writing-jobs', async (c) => {
    const result = await createWritingJob(
      c.req.param('projectId'),
      await c.req.json<CreateWritingJobInput>(),
    )
    return result.error ? c.json(fail(result.error), 400) : c.json(success(result.row), 201)
  })

  app.post('/api/projects/:projectId/writing-jobs/:id/start', async (c) => {
    const projectId = c.req.param('projectId')
    const id = c.req.param('id')
    try {
      await startJob(projectId, id)
      const row = await getWritingJob(projectId, id)
      return row ? c.json(success(row)) : c.json(fail('Job not found'), 404)
    }
    catch (error: unknown) {
      return c.json(fail(errorMessage(error, 'Failed to start job')), 500)
    }
  })

  app.post('/api/projects/:projectId/writing-jobs/:id/pause', async (c) => {
    const row = await pauseWritingJob(c.req.param('projectId'), c.req.param('id'))
    return row ? c.json(success(row)) : c.json(fail('Job not found'), 404)
  })

  app.post('/api/projects/:projectId/writing-jobs/:id/continue', async (c) => {
    const row = await continueWritingJob(c.req.param('projectId'), c.req.param('id'))
    return row ? c.json(success(row)) : c.json(fail('Job not found or not in paused state'), 404)
  })

  app.delete('/api/projects/:projectId/writing-jobs/:id', async (c) => {
    const row = await deleteWritingJob(c.req.param('projectId'), c.req.param('id'))
    return row ? c.json(success(row, 'Job deleted')) : c.json(fail('Job not found'), 404)
  })

  app.get('/api/projects/:projectId/writing-jobs/:jobId/steps', async (c) => {
    const steps = await getProjectJobSteps(c.req.param('projectId'), c.req.param('jobId'))
    return steps ? c.json(success(steps)) : c.json(fail('Job not found'), 404)
  })

  app.post('/api/projects/:projectId/writing-jobs/:jobId/steps/:stepId/retry', async (c) => {
    const projectId = c.req.param('projectId')
    const jobId = c.req.param('jobId')
    try {
      await retryStep(projectId, jobId, c.req.param('stepId'))
      const [job, steps] = await Promise.all([getWritingJob(projectId, jobId), getJobSteps(jobId)])
      return c.json(success({ job, steps }))
    }
    catch (error: unknown) {
      return c.json(fail(errorMessage(error, 'Failed to retry step')), 400)
    }
  })
}
