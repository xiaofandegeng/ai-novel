import type { JsonObject } from '../../eventing'
import { commandBus } from '../../eventing-runtime'
import { generateId } from '../../shared/utils'
import { STORY_STRUCTURE_AGGREGATE_TYPE } from './story-structure.eventing'

export interface StoryStructureCommandOptions {
  commandId?: string
  correlationId?: string
  causationId?: string
}

export function dispatchStoryStructureCommand<TResult extends JsonObject>(
  commandType: string,
  projectId: string,
  payload: JsonObject,
  options: StoryStructureCommandOptions = {},
): Promise<TResult> {
  const commandId = options.commandId ?? generateId()
  return commandBus.dispatch<TResult>({
    commandId,
    commandType,
    aggregateType: STORY_STRUCTURE_AGGREGATE_TYPE,
    aggregateId: projectId,
    projectId,
    correlationId: options.correlationId ?? commandId,
    ...(options.causationId ? { causationId: options.causationId } : {}),
    payload,
  })
}

export function compactStoryPayload(input: object): JsonObject {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined),
  )
}
