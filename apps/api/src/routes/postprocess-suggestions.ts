import type { Hono } from 'hono'
import { acceptSuggestion, applyAcceptedSuggestions, getSuggestions, rejectSuggestion } from '../services/postprocess-suggestion.service'
import { runGraphInference } from '../services/story-graph-inference.service'
import { fail, success } from '../utils'

export function registerPostprocessSuggestionRoutes(app: Hono) {
  app.get('/api/projects/:projectId/chapters/:chapterId/suggestions', async (c) => {
    const projectId = c.req.param('projectId')
    const chapterId = c.req.param('chapterId')
    const runId = c.req.query('runId')
    const rows = await getSuggestions(projectId, chapterId, runId || undefined)
    return c.json(success(rows))
  })

  app.post('/api/projects/:projectId/suggestions/:id/accept', async (c) => {
    const projectId = c.req.param('projectId')
    const id = c.req.param('id')
    const row = await acceptSuggestion(projectId, id)
    if (!row)
      return c.json(fail('建议不存在或已处理'), 404)
    return c.json(success(row))
  })

  app.post('/api/projects/:projectId/suggestions/:id/reject', async (c) => {
    const projectId = c.req.param('projectId')
    const id = c.req.param('id')
    const row = await rejectSuggestion(projectId, id)
    if (!row)
      return c.json(fail('建议不存在或已处理'), 404)
    return c.json(success(row))
  })

  app.post('/api/projects/:projectId/chapters/:chapterId/suggestions/apply-accepted', async (c) => {
    const projectId = c.req.param('projectId')
    const chapterId = c.req.param('chapterId')
    const count = await applyAcceptedSuggestions(projectId, chapterId)
    return c.json(success({ applied: count }))
  })

  app.post('/api/projects/:projectId/inference/run', async (c) => {
    const projectId = c.req.param('projectId')
    const count = await runGraphInference(projectId)
    return c.json(success({ suggestionsCreated: count }))
  })
}
