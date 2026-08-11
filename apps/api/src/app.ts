import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { registerActRoutes } from './routes/acts'
import { registerAiRoutes } from './routes/ai'
import { registerAICandidateRoutes } from './routes/ai-candidates'
import { registerAIContextSnapshotRoutes } from './routes/ai-context-snapshots'
import { registerAIUsageRoutes } from './routes/ai-usage'
import { registerAuthoringEventRoutes } from './routes/authoring-events'
import { registerAutomationCockpitRoutes } from './routes/automation-cockpit'
import { registerAutonomousRunRoutes } from './routes/autonomous-runs'
import { registerChapterChangeSetRoutes } from './routes/chapter-change-sets'
import { registerChapterElementRoutes } from './routes/chapter-elements'
import { registerChapterRoutes } from './routes/chapters'
import { registerCharacterArcRoutes } from './routes/character-arc'
import { registerCharacterRoutes } from './routes/characters'
import { registerConflictTimelineRoutes } from './routes/conflict-timeline'
import { registerConflictRoutes } from './routes/conflicts'
import { registerForeshadowingRoutes } from './routes/foreshadowing'
import { registerHealthMetricsRoutes } from './routes/health-metrics'
import { registerPostprocessSuggestionRoutes } from './routes/postprocess-suggestions'
import { registerProjectExportRoutes } from './routes/project-export'
import { registerProjectRoutes } from './routes/projects'
import { registerPromptTemplateRoutes } from './routes/prompt-templates'
import { registerRelationshipRoutes } from './routes/relationships'
import { registerSceneRoutes } from './routes/scenes'
import { registerSettingsRoutes } from './routes/settings'
import { registerStoryBibleRoutes } from './routes/story-bibles'
import { registerStoryStructureRoutes } from './routes/story-structure'
import { registerVersionRoutes } from './routes/versions'
import { registerVolumeRoutes } from './routes/volumes'
import { registerWritingJobRoutes } from './routes/writing-jobs'
import { fail } from './utils'

interface CreateAppOptions {
  logging?: boolean
}

export function createApp(options: CreateAppOptions = {}) {
  const app = new Hono()
  const logging = options.logging ?? true

  if (logging)
    app.use('*', logger())

  app.use('*', cors({
    origin: ['http://localhost:5173'],
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  }))

  registerProjectRoutes(app)
  registerProjectExportRoutes(app)
  registerStoryBibleRoutes(app)
  registerCharacterRoutes(app)
  registerCharacterArcRoutes(app)
  registerVolumeRoutes(app)
  registerActRoutes(app)
  registerChapterRoutes(app)
  registerChapterElementRoutes(app)
  registerSceneRoutes(app)
  registerAiRoutes(app)
  registerRelationshipRoutes(app)
  registerConflictRoutes(app)
  registerConflictTimelineRoutes(app)
  registerForeshadowingRoutes(app)
  registerVersionRoutes(app)
  registerHealthMetricsRoutes(app)
  registerSettingsRoutes(app)
  registerWritingJobRoutes(app)
  registerChapterChangeSetRoutes(app)
  registerPostprocessSuggestionRoutes(app)
  registerAIContextSnapshotRoutes(app)
  registerStoryStructureRoutes(app)
  registerAuthoringEventRoutes(app)
  registerAIUsageRoutes(app)
  registerPromptTemplateRoutes(app)
  registerAICandidateRoutes(app)
  registerAutonomousRunRoutes(app)
  registerAutomationCockpitRoutes(app)

  app.notFound(c => c.json(fail('Not Found'), 404))
  app.onError((error, c) => {
    if (logging)
      console.error('Server error:', error)
    return c.json(fail('Internal Server Error'), 500)
  })

  return app
}
