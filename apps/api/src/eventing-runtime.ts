import {
  AggregateRepository,
  CommandBus,
  EventRegistry,
  EventStore,
  OutboxHandlerRegistry,
  OutboxWorker,
  ProjectEventingContentProtector,
  ProjectionRegistry,
} from './eventing'
import { registerAIOperationsEventing } from './modules/ai/ai-operations.eventing'
import { registerProjectSettingsEventing } from './modules/ai/project-settings.eventing'
import { registerPromptSettingsEventing } from './modules/ai/prompt-settings.eventing'
import { AUTONOMOUS_RUN_OUTBOX_HANDLER, registerAutonomousRunEventing } from './modules/automation/autonomous-run.eventing'
import { registerChapterChangeSetEventing } from './modules/automation/chapter-change-set.eventing'
import { registerPostprocessEventing } from './modules/automation/postprocess.eventing'
import { registerWritingJobEventing, WRITING_JOB_OUTBOX_HANDLER } from './modules/automation/writing-job.eventing'
import { registerCharacterEventing } from './modules/character/character.eventing'
import { registerRelationshipEventing } from './modules/character/relationship.eventing'
import { registerConflictEventing } from './modules/narrative/conflict.eventing'
import { registerForeshadowingEventing } from './modules/narrative/foreshadowing.eventing'
import { registerNarrativeKnowledgeEventing } from './modules/narrative/narrative-knowledge.eventing'
import {
  PROJECT_CREATED,
  PROJECT_DELETED,
  registerProjectEventing,
} from './modules/project/project.eventing'
import { registerChapterKnowledgeEventing } from './modules/story/chapter-knowledge.eventing'
import { registerChapterEventing } from './modules/story/chapter.eventing'
import { registerStoryStructureEventing } from './modules/story/story-structure.eventing'
import { ProjectDataKeyStore } from './security/project-data-key.store'

export const domainEventRegistry = new EventRegistry()
export const projectDataKeyStore = new ProjectDataKeyStore()
export const eventingContentProtector = new ProjectEventingContentProtector(
  domainEventRegistry,
  projectDataKeyStore,
  {
    projectCreatedEventType: PROJECT_CREATED,
    projectDeletedEventType: PROJECT_DELETED,
  },
)
export const eventStore = new EventStore({
  contentProtector: eventingContentProtector,
  projectDeletedEventType: PROJECT_DELETED,
})
export const projectionRegistry = new ProjectionRegistry(domainEventRegistry)
export const commandBus = new CommandBus(eventStore, projectionRegistry, domainEventRegistry)
export const aggregateRepository = new AggregateRepository(eventStore, domainEventRegistry)

registerProjectEventing({
  aggregates: aggregateRepository,
  commands: commandBus,
  events: domainEventRegistry,
  projections: projectionRegistry,
})
registerAIOperationsEventing({
  aggregates: aggregateRepository,
  commands: commandBus,
  events: domainEventRegistry,
  projections: projectionRegistry,
})
registerProjectSettingsEventing({
  aggregates: aggregateRepository,
  commands: commandBus,
  events: domainEventRegistry,
  projections: projectionRegistry,
})
registerPromptSettingsEventing({
  aggregates: aggregateRepository,
  commands: commandBus,
  events: domainEventRegistry,
  projections: projectionRegistry,
})
registerStoryStructureEventing({
  aggregates: aggregateRepository,
  commands: commandBus,
  events: domainEventRegistry,
  projections: projectionRegistry,
})
registerChapterEventing({
  aggregates: aggregateRepository,
  commands: commandBus,
  events: domainEventRegistry,
  projections: projectionRegistry,
})
registerCharacterEventing({
  aggregates: aggregateRepository,
  commands: commandBus,
  events: domainEventRegistry,
  projections: projectionRegistry,
})
registerRelationshipEventing({
  aggregates: aggregateRepository,
  commands: commandBus,
  events: domainEventRegistry,
  projections: projectionRegistry,
})
registerConflictEventing({
  aggregates: aggregateRepository,
  commands: commandBus,
  events: domainEventRegistry,
  projections: projectionRegistry,
})
registerForeshadowingEventing({
  aggregates: aggregateRepository,
  commands: commandBus,
  events: domainEventRegistry,
  projections: projectionRegistry,
})
registerChapterKnowledgeEventing({
  aggregates: aggregateRepository,
  commands: commandBus,
  events: domainEventRegistry,
  projections: projectionRegistry,
})
registerNarrativeKnowledgeEventing({
  aggregates: aggregateRepository,
  commands: commandBus,
  events: domainEventRegistry,
  projections: projectionRegistry,
})
registerWritingJobEventing({
  aggregates: aggregateRepository,
  commands: commandBus,
  events: domainEventRegistry,
  projections: projectionRegistry,
})
registerAutonomousRunEventing({
  aggregates: aggregateRepository,
  commands: commandBus,
  events: domainEventRegistry,
  projections: projectionRegistry,
})
registerChapterChangeSetEventing({
  aggregates: aggregateRepository,
  commands: commandBus,
  events: domainEventRegistry,
  projections: projectionRegistry,
})
registerPostprocessEventing({
  aggregates: aggregateRepository,
  commands: commandBus,
  events: domainEventRegistry,
  projections: projectionRegistry,
})

export const outboxHandlerRegistry = new OutboxHandlerRegistry()
outboxHandlerRegistry.register(AUTONOMOUS_RUN_OUTBOX_HANDLER, async (message) => {
  const { projectId, runId } = message.payload
  if (typeof projectId !== 'string' || typeof runId !== 'string')
    throw new Error('Autonomous execution outbox payload is invalid')
  const { advanceAutonomousWritingRun } = await import('./modules/automation/autonomous-writing.process-manager')
  await advanceAutonomousWritingRun(projectId, runId)
})
outboxHandlerRegistry.register(WRITING_JOB_OUTBOX_HANDLER, async (message) => {
  const { jobId, projectId } = message.payload
  if (typeof projectId !== 'string' || typeof jobId !== 'string')
    throw new Error('Writing execution outbox payload is invalid')
  const { executeWritingJob } = await import('./modules/automation/writing-job.service')
  await executeWritingJob(projectId, jobId)
})

export const outboxWorker = new OutboxWorker({
  workerId: 'api-worker',
  handlers: outboxHandlerRegistry,
})

let drainPromise: Promise<void> | null = null

export function wakeEventOutbox(): Promise<void> {
  if (!drainPromise) {
    drainPromise = drainEventOutbox().finally(() => {
      drainPromise = null
    })
  }
  return drainPromise
}

export function startEventOutboxPolling(intervalMs = 500): () => void {
  if (!Number.isInteger(intervalMs) || intervalMs < 1)
    throw new Error('Outbox polling interval must be a positive integer')
  wakeEventOutbox()
  const timer = setInterval(wakeEventOutbox, intervalMs)
  timer.unref()
  return () => clearInterval(timer)
}

async function drainEventOutbox(): Promise<void> {
  while (await outboxWorker.runOnce() > 0) {
    // Drain all messages that became available while the previous batch ran.
  }
}
