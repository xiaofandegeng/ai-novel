import type { JsonObject } from '../../eventing'
import type { StoryStructureCommandOptions } from '../story/story-structure.commands'
import { commandBus } from '../../eventing-runtime'
import { generateId } from '../../shared/utils'
import { compactStoryPayload } from '../story/story-structure.commands'
import { FORESHADOWING_AGGREGATE_TYPE } from './foreshadowing.eventing'

export type ForeshadowingCommandOptions = StoryStructureCommandOptions

export function dispatchForeshadowingCommand<TResult extends JsonObject>(
  commandType: string,
  projectId: string,
  foreshadowingId: string,
  payload: JsonObject,
  options: ForeshadowingCommandOptions = {},
): Promise<TResult> {
  const commandId = options.commandId ?? generateId()
  return commandBus.dispatch<TResult>({
    commandId,
    commandType,
    aggregateType: FORESHADOWING_AGGREGATE_TYPE,
    aggregateId: foreshadowingId,
    projectId,
    correlationId: options.correlationId ?? commandId,
    ...(options.causationId ? { causationId: options.causationId } : {}),
    payload,
  })
}

export { compactStoryPayload as compactForeshadowingPayload }
