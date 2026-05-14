import { Hono } from 'hono'
import { retrieveKnowledgeForAI } from '../services/knowledge-retrieval.service'

export function registerRetrievalRoutes(app: Hono) {
  const retrieval = new Hono()

  retrieval.post('/test', async (c) => {
    const projectId = c.req.param('projectId') as string
    const { query, limit = 5 } = await c.req.json()

    if (!query) {
      return c.json({ error: 'Query is required' }, 400)
    }

    // Basic term extraction from query
    const terms = query.split(/[\s,，、。.]+/).filter((t: string) => t.length >= 2)

    const results = await retrieveKnowledgeForAI({
      projectId,
      terms,
      characterNames: [],
      conflictTitles: [],
      factTripleSubjects: [],
      limit,
    })

    return c.json({ results })
  })

  app.route('/api/projects/:projectId/retrieval', retrieval)
}
