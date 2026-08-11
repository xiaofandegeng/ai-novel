import type { Hono } from 'hono'
import { registerAICandidateRoutes } from './ai/ai-candidates.routes'
import { registerAIContextSnapshotRoutes } from './ai/ai-context-snapshots.routes'
import { registerAIUsageRoutes } from './ai/ai-usage.routes'
import { registerAiRoutes } from './ai/ai.routes'
import { registerPromptTemplateRoutes } from './ai/prompt-templates.routes'
import { registerSettingsRoutes } from './ai/settings.routes'
import { registerAutomationCockpitRoutes } from './automation/automation-cockpit.routes'
import { registerAutonomousRunRoutes } from './automation/autonomous-runs.routes'
import { registerChapterChangeSetRoutes } from './automation/chapter-change-sets.routes'
import { registerPostprocessSuggestionRoutes } from './automation/postprocess-suggestions.routes'
import { registerWritingJobRoutes } from './automation/writing-jobs.routes'
import { registerCharacterArcRoutes } from './character/character-arc.routes'
import { registerCharacterRoutes } from './character/characters.routes'
import { registerRelationshipRoutes } from './character/relationships.routes'
import { registerAuthoringEventRoutes } from './narrative/authoring-events.routes'
import { registerConflictTimelineRoutes } from './narrative/conflict-timeline.routes'
import { registerConflictRoutes } from './narrative/conflicts.routes'
import { registerForeshadowingRoutes } from './narrative/foreshadowing.routes'
import { registerHealthMetricsRoutes } from './narrative/health-metrics.routes'
import { registerProjectExportRoutes } from './project/project-export.routes'
import { registerProjectRoutes } from './project/projects.routes'
import { registerActRoutes } from './story/acts.routes'
import { registerChapterElementRoutes } from './story/chapter-elements.routes'
import { registerChapterRoutes } from './story/chapters.routes'
import { registerSceneRoutes } from './story/scenes.routes'
import { registerStoryBibleRoutes } from './story/story-bibles.routes'
import { registerStoryStructureRoutes } from './story/story-structure.routes'
import { registerVersionRoutes } from './story/versions.routes'
import { registerVolumeRoutes } from './story/volumes.routes'

type ModuleRegistrar = (app: Hono) => void

// Keep protocol registration order explicit. Domain folders own the implementation;
// this composition root is the only place that assembles the HTTP surface.
const moduleRegistrars: ModuleRegistrar[] = [
  registerProjectRoutes,
  registerProjectExportRoutes,
  registerStoryBibleRoutes,
  registerCharacterRoutes,
  registerCharacterArcRoutes,
  registerVolumeRoutes,
  registerActRoutes,
  registerChapterRoutes,
  registerChapterElementRoutes,
  registerSceneRoutes,
  registerAiRoutes,
  registerRelationshipRoutes,
  registerConflictRoutes,
  registerConflictTimelineRoutes,
  registerForeshadowingRoutes,
  registerVersionRoutes,
  registerHealthMetricsRoutes,
  registerSettingsRoutes,
  registerWritingJobRoutes,
  registerChapterChangeSetRoutes,
  registerPostprocessSuggestionRoutes,
  registerAIContextSnapshotRoutes,
  registerStoryStructureRoutes,
  registerAuthoringEventRoutes,
  registerAIUsageRoutes,
  registerPromptTemplateRoutes,
  registerAICandidateRoutes,
  registerAutonomousRunRoutes,
  registerAutomationCockpitRoutes,
]

export function registerApiModules(app: Hono) {
  for (const register of moduleRegistrars)
    register(app)
}
