import type { Hono } from 'hono'
import * as knowledgeService from '../services/knowledge.service'
import { fail, success } from '../utils'

export function registerKnowledgeRoutes(app: Hono) {
  app.get('/api/projects/:projectId/knowledge/sources', async (c) => {
    const projectId = c.req.param('projectId')
    const sources = await knowledgeService.listSources(projectId)
    return c.json(success(sources))
  })

  app.post('/api/projects/:projectId/knowledge/sources', async (c) => {
    const projectId = c.req.param('projectId')
    const body = await c.req.json()
    const source = await knowledgeService.createSource(projectId, body)
    return c.json(success(source))
  })

  app.get('/api/projects/:projectId/knowledge/sources/:id', async (c) => {
    const projectId = c.req.param('projectId')
    const id = c.req.param('id')
    const result = await knowledgeService.getSourceDetail(projectId, id)
    if (!result || (typeof result === 'object' && 'error' in result && result.error))
      return c.json(fail('Source not found'), 404)
    return c.json(success(result))
  })

  app.post('/api/projects/:projectId/knowledge/sources/:id/analyze', async (c) => {
    const projectId = c.req.param('projectId')
    const id = c.req.param('id')
    const { content } = await c.req.json()

    if (!content)
      return c.json(fail('No content to analyze'), 400)

    try {
      const result = await knowledgeService.analyzeSource(projectId, id, content)
      if (typeof result === 'object' && 'error' in result && result.error)
        return c.json(fail(result.error), 404)
      return c.json(success(result))
    }
    catch (e: any) {
      return c.json(fail(e.message), 500)
    }
  })

  app.get('/api/projects/:projectId/knowledge/search', async (c) => {
    const projectId = c.req.param('projectId')
    const query = c.req.query('q') || ''
    const results = await knowledgeService.searchKnowledge(projectId, query)
    return c.json(success(results))
  })

  app.get('/api/projects/:projectId/knowledge/notes', async (c) => {
    const projectId = c.req.param('projectId')
    const notes = await knowledgeService.listNotes(projectId)
    return c.json(success(notes))
  })
}
