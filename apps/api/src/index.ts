import process from 'node:process'
import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { registerActRoutes } from './routes/acts'
import { registerAiRoutes } from './routes/ai'
import { registerAICandidateRoutes } from './routes/ai-candidates'
import { registerAIContextSnapshotRoutes } from './routes/ai-context-snapshots'
import { registerAIQualityFeedbackRoutes } from './routes/ai-quality-feedback'
import { registerAIUsageRoutes } from './routes/ai-usage'
import { registerAuthoringEventRoutes } from './routes/authoring-events'
import { registerAuthoringReportRoutes } from './routes/authoring-reports'
import { registerAutonomousRunRoutes } from './routes/autonomous-runs'
import { registerChapterChangeSetRoutes } from './routes/chapter-change-sets'
import { registerChapterElementRoutes } from './routes/chapter-elements'
import { registerChapterRoutes } from './routes/chapters'
import { registerCharacterArcRoutes } from './routes/character-arc'
import { registerCharacterRoutes } from './routes/characters'
import { registerConflictTimelineRoutes } from './routes/conflict-timeline'
import { registerConflictRoutes } from './routes/conflicts'
import { registerContinuityRoutes } from './routes/continuity'
import { registerDataPortabilityRoutes } from './routes/data-portability'
import { registerForeshadowingRoutes } from './routes/foreshadowing'
import { registerForeshadowingAnalysisRoutes } from './routes/foreshadowing-analysis'
import { registerHealthRoutes } from './routes/health'
import { registerHealthMetricsRoutes } from './routes/health-metrics'
import { registerKnowledgeRoutes } from './routes/knowledge'
import { registerPersonaRoutes } from './routes/persona'
import { registerPersonaMemoryRoutes } from './routes/persona-memory'
import { registerPostprocessSuggestionRoutes } from './routes/postprocess-suggestions'
import { registerProjectRoutes } from './routes/projects'
import { registerPromptTemplateRoutes } from './routes/prompt-templates'
import { registerQualityRoutes } from './routes/quality'
import { registerRelationshipRoutes } from './routes/relationships'
import { registerRetrievalRoutes } from './routes/retrieval'
import { registerSceneRoutes } from './routes/scenes'
import { registerSettingsRoutes } from './routes/settings'
import { registerStoryBibleRoutes } from './routes/story-bibles'
import { registerStoryStructureRoutes } from './routes/story-structure'
import { registerTripleRoutes } from './routes/triples'
import { registerVersionRoutes } from './routes/versions'
import { registerVolumeRoutes } from './routes/volumes'
import { registerWritingGoalRoutes } from './routes/writing-goals'
import { registerWritingJobRoutes } from './routes/writing-jobs'

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
registerActRoutes(app)
registerChapterRoutes(app)
registerChapterElementRoutes(app)
registerSceneRoutes(app)
registerAiRoutes(app)
registerRelationshipRoutes(app)
registerConflictRoutes(app)
registerForeshadowingRoutes(app)
registerTripleRoutes(app)
registerVersionRoutes(app)
registerKnowledgeRoutes(app)
registerQualityRoutes(app)
registerHealthMetricsRoutes(app)
registerSettingsRoutes(app)
registerPersonaRoutes(app)
registerWritingJobRoutes(app)
registerChapterChangeSetRoutes(app)
registerPostprocessSuggestionRoutes(app)
registerAIContextSnapshotRoutes(app)
registerStoryStructureRoutes(app)
registerContinuityRoutes(app)
registerPersonaMemoryRoutes(app)
registerDataPortabilityRoutes(app)
registerAuthoringEventRoutes(app)
registerAIQualityFeedbackRoutes(app)
registerAIUsageRoutes(app)
registerPromptTemplateRoutes(app)
registerAuthoringReportRoutes(app)
registerCharacterArcRoutes(app)
registerConflictTimelineRoutes(app)
registerForeshadowingAnalysisRoutes(app)
registerWritingGoalRoutes(app)
registerAICandidateRoutes(app)
registerRetrievalRoutes(app)
registerAutonomousRunRoutes(app)

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
