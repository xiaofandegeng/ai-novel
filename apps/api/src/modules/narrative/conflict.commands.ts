import type { JsonObject } from '../../eventing'
import type { StoryStructureCommandOptions } from '../story/story-structure.commands'
import { commandBus } from '../../eventing-runtime'
import { generateId } from '../../shared/utils'
import { compactStoryPayload } from '../story/story-structure.commands'
import { CONFLICT_AGGREGATE_TYPE } from './conflict.eventing'

export type ConflictCommandOptions = StoryStructureCommandOptions

export function dispatchConflictCommand<TResult extends JsonObject>(
  commandType: string,
  projectId: string,
  conflictId: string,
  payload: JsonObject,
  options: ConflictCommandOptions = {},
): Promise<TResult> {
  const commandId = options.commandId ?? generateId()
  return commandBus.dispatch<TResult>({
    commandId,
    commandType,
    aggregateType: CONFLICT_AGGREGATE_TYPE,
    aggregateId: conflictId,
    projectId,
    correlationId: options.correlationId ?? commandId,
    ...(options.causationId ? { causationId: options.causationId } : {}),
    payload,
  })
}

export { compactStoryPayload as compactConflictPayload }
