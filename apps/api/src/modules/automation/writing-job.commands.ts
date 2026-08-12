import type { JsonObject } from '../../eventing'
import type { StoryStructureCommandOptions } from '../story/story-structure.commands'
import { commandBus } from '../../eventing-runtime'
import { generateId } from '../../shared/utils'
import { compactStoryPayload } from '../story/story-structure.commands'
import { WRITING_JOB_AGGREGATE_TYPE } from './writing-job.eventing'

export type WritingJobCommandOptions = StoryStructureCommandOptions

export function dispatchWritingJobCommand<TResult extends JsonObject>(
  commandType: string,
  projectId: string,
  jobId: string,
  payload: JsonObject,
  options: WritingJobCommandOptions = {},
): Promise<TResult> {
  const commandId = options.commandId ?? generateId()
  return commandBus.dispatch<TResult>({
    commandId,
    commandType,
    aggregateType: WRITING_JOB_AGGREGATE_TYPE,
    aggregateId: jobId,
    projectId,
    correlationId: options.correlationId ?? commandId,
    ...(options.causationId ? { causationId: options.causationId } : {}),
    payload,
  })
}

export { compactStoryPayload as compactWritingJobPayload }
