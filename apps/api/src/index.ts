import process from 'node:process'
import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { registerAiRoutes } from './routes/ai'
import { registerChapterRoutes } from './routes/chapters'
import { registerCharacterRoutes } from './routes/characters'
import { registerConflictRoutes } from './routes/conflicts'
import { registerExportRoutes } from './routes/export'
import { registerHealthRoutes } from './routes/health'
import { registerKnowledgeRoutes } from './routes/knowledge'
import { registerPersonaRoutes } from './routes/persona'
import { registerProjectRoutes } from './routes/projects'
import { registerQualityRoutes } from './routes/quality'
import { registerRelationshipRoutes } from './routes/relationships'
import { registerSettingsRoutes } from './routes/settings'
import { registerStoryBibleRoutes } from './routes/story-bibles'
import { registerVersionRoutes } from './routes/versions'
import { registerVolumeRoutes } from './routes/volumes'

const app = new Hono()

app.use('*', logger())
app.use('*', cors({
  origin: ['http://localhost:5173'],
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
}))

registerHealthRoutes(app)
registerProjectRoutes(app)
registerStoryBibleRoutes(app)
registerCharacterRoutes(app)
registerVolumeRoutes(app)
registerChapterRoutes(app)
registerAiRoutes(app)
registerRelationshipRoutes(app)
registerConflictRoutes(app)
registerVersionRoutes(app)
registerExportRoutes(app)
registerKnowledgeRoutes(app)
registerQualityRoutes(app)
registerSettingsRoutes(app)
registerPersonaRoutes(app)

app.notFound((c) => {
  return c.json({ error: 'Not Found' }, 404)
})

app.onError((err, c) => {
  console.error('Server error:', err)
  return c.json({ error: 'Internal Server Error' }, 500)
})

const port = Number(process.env.PORT) || 3000

serve({ fetch: app.fetch, port }, (info) => {
  // eslint-disable-next-line no-console
  console.log(`AI Novel API running on http://localhost:${info.port}`)
})
