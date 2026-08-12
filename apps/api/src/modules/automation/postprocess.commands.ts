import type { JsonObject } from '../../eventing'
import type { StoryStructureCommandOptions } from '../story/story-structure.commands'
import { commandBus } from '../../eventing-runtime'
import { generateId } from '../../shared/utils'
import { compactStoryPayload } from '../story/story-structure.commands'
import {
  POSTPROCESS_RUN_AGGREGATE_TYPE,
  POSTPROCESS_SUGGESTION_AGGREGATE_TYPE,
  STYLE_FINGERPRINT_AGGREGATE_TYPE,
} from './postprocess.eventing'

export type PostprocessCommandOptions = StoryStructureCommandOptions

function dispatch<TResult extends JsonObject>(
  aggregateType: string,
  commandType: string,
  projectId: string,
  aggregateId: string,
  payload: JsonObject,
  options: PostprocessCommandOptions = {},
): Promise<TResult> {
  const commandId = options.commandId ?? generateId()
  return commandBus.dispatch<TResult>({
    commandId,
    commandType,
    aggregateType,
    aggregateId,
    projectId,
    correlationId: options.correlationId ?? commandId,
    ...(options.causationId ? { causationId: options.causationId } : {}),
    payload,
  })
}

export const dispatchPostprocessRunCommand = <TResult extends JsonObject>(commandType: string, projectId: string, runId: string, payload: JsonObject, options?: PostprocessCommandOptions) => dispatch<TResult>(POSTPROCESS_RUN_AGGREGATE_TYPE, commandType, projectId, runId, payload, options)
export const dispatchPostprocessSuggestionCommand = <TResult extends JsonObject>(commandType: string, projectId: string, suggestionId: string, payload: JsonObject, options?: PostprocessCommandOptions) => dispatch<TResult>(POSTPROCESS_SUGGESTION_AGGREGATE_TYPE, commandType, projectId, suggestionId, payload, options)
export const dispatchStyleFingerprintCommand = <TResult extends JsonObject>(commandType: string, projectId: string, fingerprintId: string, payload: JsonObject, options?: PostprocessCommandOptions) => dispatch<TResult>(STYLE_FINGERPRINT_AGGREGATE_TYPE, commandType, projectId, fingerprintId, payload, options)

export { compactStoryPayload as compactPostprocessPayload }
