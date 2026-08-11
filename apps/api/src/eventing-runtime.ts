import {
  AggregateRepository,
  CommandBus,
  EventRegistry,
  EventStore,
  ProjectionRegistry,
} from './eventing'
import { registerProjectSettingsEventing } from './modules/ai/project-settings.eventing'
import { registerProjectEventing } from './modules/project/project.eventing'

export const eventStore = new EventStore()
export const domainEventRegistry = new EventRegistry()
export const projectionRegistry = new ProjectionRegistry()
export const commandBus = new CommandBus(eventStore, projectionRegistry)
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
