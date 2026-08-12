import type { JsonObject } from '../../eventing'
import type { StoryStructureCommandOptions } from '../story/story-structure.commands'
import { commandBus } from '../../eventing-runtime'
import { generateId } from '../../shared/utils'
import { compactStoryPayload } from '../story/story-structure.commands'
import { CHANGE_SET_AGGREGATE_TYPE } from './chapter-change-set.eventing'

export type ChapterChangeSetCommandOptions = StoryStructureCommandOptions

export function dispatchChapterChangeSetCommand<TResult extends JsonObject>(
  commandType: string,
  projectId: string,
  changeSetId: string,
  payload: JsonObject,
  options: ChapterChangeSetCommandOptions = {},
): Promise<TResult> {
  const commandId = options.commandId ?? generateId()
  return commandBus.dispatch<TResult>({
    commandId,
    commandType,
    aggregateType: CHANGE_SET_AGGREGATE_TYPE,
    aggregateId: changeSetId,
    projectId,
    correlationId: options.correlationId ?? commandId,
    ...(options.causationId ? { causationId: options.causationId } : {}),
    payload,
  })
}

export { compactStoryPayload as compactChapterChangeSetPayload }
