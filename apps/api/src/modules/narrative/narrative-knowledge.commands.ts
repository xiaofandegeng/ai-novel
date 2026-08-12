import type { JsonObject } from '../../eventing'
import type { StoryStructureCommandOptions } from '../story/story-structure.commands'
import { commandBus } from '../../eventing-runtime'
import { generateId } from '../../shared/utils'
import { compactStoryPayload } from '../story/story-structure.commands'
import { NARRATIVE_KNOWLEDGE_AGGREGATE_TYPE } from './narrative-knowledge.eventing'

export type NarrativeKnowledgeCommandOptions = StoryStructureCommandOptions

export function dispatchNarrativeKnowledgeCommand<TResult extends JsonObject>(
  commandType: string,
  projectId: string,
  payload: JsonObject,
  options: NarrativeKnowledgeCommandOptions = {},
): Promise<TResult> {
  const commandId = options.commandId ?? generateId()
  return commandBus.dispatch<TResult>({
    commandId,
    commandType,
    aggregateType: NARRATIVE_KNOWLEDGE_AGGREGATE_TYPE,
    aggregateId: projectId,
    projectId,
    correlationId: options.correlationId ?? commandId,
    ...(options.causationId ? { causationId: options.causationId } : {}),
    payload,
  })
}

export { compactStoryPayload as compactNarrativeKnowledgePayload }
