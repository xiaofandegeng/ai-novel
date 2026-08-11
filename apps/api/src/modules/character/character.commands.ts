import type { JsonObject } from '../../eventing'
import type { StoryStructureCommandOptions } from '../story/story-structure.commands'
import { commandBus } from '../../eventing-runtime'
import { generateId } from '../../shared/utils'
import { compactStoryPayload } from '../story/story-structure.commands'
import { CHARACTER_AGGREGATE_TYPE } from './character.eventing'

export type CharacterCommandOptions = StoryStructureCommandOptions

export function dispatchCharacterCommand<TResult extends JsonObject>(
  commandType: string,
  projectId: string,
  characterId: string,
  payload: JsonObject,
  options: CharacterCommandOptions = {},
): Promise<TResult> {
  const commandId = options.commandId ?? generateId()
  return commandBus.dispatch<TResult>({
    commandId,
    commandType,
    aggregateType: CHARACTER_AGGREGATE_TYPE,
    aggregateId: characterId,
    projectId,
    correlationId: options.correlationId ?? commandId,
    ...(options.causationId ? { causationId: options.causationId } : {}),
    payload,
  })
}

export { compactStoryPayload as compactCharacterPayload }
