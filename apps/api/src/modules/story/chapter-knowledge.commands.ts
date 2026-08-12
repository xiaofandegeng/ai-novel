import type { JsonObject } from '../../eventing'
import type { StoryStructureCommandOptions } from './story-structure.commands'
import { commandBus } from '../../eventing-runtime'
import { generateId } from '../../shared/utils'
import { CHAPTER_KNOWLEDGE_AGGREGATE_TYPE } from './chapter-knowledge.eventing'
import { compactStoryPayload } from './story-structure.commands'

export type ChapterKnowledgeCommandOptions = StoryStructureCommandOptions

export function dispatchChapterKnowledgeCommand<TResult extends JsonObject>(
  commandType: string,
  projectId: string,
  chapterId: string,
  payload: JsonObject,
  options: ChapterKnowledgeCommandOptions = {},
): Promise<TResult> {
  const commandId = options.commandId ?? generateId()
  return commandBus.dispatch<TResult>({
    commandId,
    commandType,
    aggregateType: CHAPTER_KNOWLEDGE_AGGREGATE_TYPE,
    aggregateId: chapterId,
    projectId,
    correlationId: options.correlationId ?? commandId,
    ...(options.causationId ? { causationId: options.causationId } : {}),
    payload,
  })
}

export { compactStoryPayload as compactChapterKnowledgePayload }
