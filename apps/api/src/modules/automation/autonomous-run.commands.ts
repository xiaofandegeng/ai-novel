import type { JsonObject } from '../../eventing'
import type { StoryStructureCommandOptions } from '../story/story-structure.commands'
import { commandBus } from '../../eventing-runtime'
import { generateId } from '../../shared/utils'
import { compactStoryPayload } from '../story/story-structure.commands'
import { AUTONOMOUS_RUN_AGGREGATE_TYPE } from './autonomous-run.eventing'

export type AutonomousRunCommandOptions = StoryStructureCommandOptions

export function dispatchAutonomousRunCommand<TResult extends JsonObject>(
  commandType: string,
  projectId: string,
  runId: string,
  payload: JsonObject,
  options: AutonomousRunCommandOptions = {},
): Promise<TResult> {
  const commandId = options.commandId ?? generateId()
  return commandBus.dispatch<TResult>({
    commandId,
    commandType,
    aggregateType: AUTONOMOUS_RUN_AGGREGATE_TYPE,
    aggregateId: runId,
    projectId,
    correlationId: options.correlationId ?? commandId,
    ...(options.causationId ? { causationId: options.causationId } : {}),
    payload,
  })
}

export { compactStoryPayload as compactAutonomousRunPayload }
