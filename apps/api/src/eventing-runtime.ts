import {
  AggregateRepository,
  CommandBus,
  EventRegistry,
  EventStore,
  ProjectionRegistry,
} from './eventing'
import { registerProjectSettingsEventing } from './modules/ai/project-settings.eventing'
import { registerPromptSettingsEventing } from './modules/ai/prompt-settings.eventing'
import { registerCharacterEventing } from './modules/character/character.eventing'
import { registerRelationshipEventing } from './modules/character/relationship.eventing'
import { registerConflictEventing } from './modules/narrative/conflict.eventing'
import { registerForeshadowingEventing } from './modules/narrative/foreshadowing.eventing'
import { registerNarrativeKnowledgeEventing } from './modules/narrative/narrative-knowledge.eventing'
import { registerProjectEventing } from './modules/project/project.eventing'
import { registerChapterKnowledgeEventing } from './modules/story/chapter-knowledge.eventing'
import { registerChapterEventing } from './modules/story/chapter.eventing'
import { registerStoryStructureEventing } from './modules/story/story-structure.eventing'

export const eventStore = new EventStore()
export const domainEventRegistry = new EventRegistry()
export const projectionRegistry = new ProjectionRegistry(domainEventRegistry)
export const commandBus = new CommandBus(eventStore, projectionRegistry, domainEventRegistry)
export const aggregateRepository = new AggregateRepository(eventStore, domainEventRegistry)

registerProjectEventing({
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
