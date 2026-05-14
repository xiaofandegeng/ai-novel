import { Hono } from 'hono'
import { retrieveKnowledgeForAI } from '../services/knowledge-retrieval.service'
import { fail, success } from '../utils'

export function registerRetrievalRoutes(app: Hono) {
  const retrieval = new Hono()

  retrieval.post('/test', async (c) => {
    const projectId = c.req.param('projectId') as string
    const { query, limit = 5 } = await c.req.json()

    if (!query) {
      return c.json(fail('请输入检索内容'), 400)
    }

    // Basic term extraction from query
    const terms = query.split(/[\s,，、。.]+/).filter((t: string) => t.length >= 2)

    const results = await retrieveKnowledgeForAI({
      projectId,
      terms,
      factTripleSubjects: terms, // Use terms as potential subjects too
      limit,
    })

    return c.json(success({
      query,
      terms,
      results,
    }))
  })

  app.route('/api/projects/:projectId/retrieval', retrieval)
}
