import type { JsonObject } from '../../eventing'
import type { CharacterCommandOptions } from './character.commands'
import { commandBus } from '../../eventing-runtime'
import { generateId } from '../../shared/utils'
import { compactCharacterPayload } from './character.commands'
import { RELATIONSHIP_AGGREGATE_TYPE } from './relationship.eventing'

export type RelationshipCommandOptions = CharacterCommandOptions

export function dispatchRelationshipCommand<TResult extends JsonObject>(
  commandType: string,
  projectId: string,
  relationshipId: string,
  payload: JsonObject,
  options: RelationshipCommandOptions = {},
): Promise<TResult> {
  const commandId = options.commandId ?? generateId()
  return commandBus.dispatch<TResult>({
    commandId,
    commandType,
    aggregateType: RELATIONSHIP_AGGREGATE_TYPE,
    aggregateId: relationshipId,
    projectId,
    correlationId: options.correlationId ?? commandId,
    ...(options.causationId ? { causationId: options.causationId } : {}),
    payload,
  })
}

export { compactCharacterPayload as compactRelationshipPayload }
