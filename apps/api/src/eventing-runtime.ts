import {
  AggregateRepository,
  CommandBus,
  EventRegistry,
  EventStore,
  ProjectionRegistry,
} from './eventing'
import { registerProjectSettingsEventing } from './modules/ai/project-settings.eventing'
import { registerPromptSettingsEventing } from './modules/ai/prompt-settings.eventing'
import { registerProjectEventing } from './modules/project/project.eventing'

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
