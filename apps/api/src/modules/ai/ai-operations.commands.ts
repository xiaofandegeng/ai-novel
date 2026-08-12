import type { JsonObject } from '../../eventing'
import type { StoryStructureCommandOptions } from '../story/story-structure.commands'
import { commandBus } from '../../eventing-runtime'
import { generateId } from '../../shared/utils'
import { compactStoryPayload } from '../story/story-structure.commands'
import { AI_OPERATION_AGGREGATE_TYPE } from './ai-operations.eventing'

export type AIOperationCommandOptions = StoryStructureCommandOptions

export function dispatchAIOperationCommand<TResult extends JsonObject>(
  commandType: string,
  projectId: string,
  operationId: string,
  payload: JsonObject,
  options: AIOperationCommandOptions = {},
): Promise<TResult> {
  const commandId = options.commandId ?? generateId()
  return commandBus.dispatch<TResult>({
    commandId,
    commandType,
    aggregateType: AI_OPERATION_AGGREGATE_TYPE,
    aggregateId: operationId,
    projectId,
    correlationId: options.correlationId ?? commandId,
    ...(options.causationId ? { causationId: options.causationId } : {}),
    payload,
  })
}

export { compactStoryPayload as compactAIOperationPayload }
