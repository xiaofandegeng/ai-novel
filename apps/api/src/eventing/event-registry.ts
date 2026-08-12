import type {
  EventPayloadProtection,
  JsonObject,
  PendingEvent,
  StoredEvent,
} from './event-types'
import {
  DuplicateEventTypeError,
  InvalidEventPayloadError,
  MissingEventUpcasterError,
  UnknownEventTypeError,
  UnsupportedEventVersionError,
} from './errors'

export interface EventDefinition<TPayload extends JsonObject> {
  eventType: string
  currentSchemaVersion: number
  payloadProtection: EventPayloadProtection
  validate: (payload: unknown) => TPayload
  upcasters: Record<number, (payload: unknown) => unknown>
}

interface RegisteredEventDefinition {
  eventType: string
  currentSchemaVersion: number
  payloadProtection: EventPayloadProtection
  validate: (payload: unknown) => JsonObject
  upcasters: Record<number, (payload: unknown) => unknown>
}

export class EventRegistry {
  private readonly definitions = new Map<string, RegisteredEventDefinition>()

  register<TPayload extends JsonObject>(definition: EventDefinition<TPayload>): void {
    if (this.definitions.has(definition.eventType))
      throw new DuplicateEventTypeError(definition.eventType)
    if (!Number.isInteger(definition.currentSchemaVersion) || definition.currentSchemaVersion < 1) {
      throw new UnsupportedEventVersionError(
        definition.eventType,
        definition.currentSchemaVersion,
        definition.currentSchemaVersion,
      )
    }

    this.definitions.set(definition.eventType, {
      ...definition,
      validate: payload => definition.validate(payload),
    })
  }

  has(eventType: string): boolean {
    return this.definitions.has(eventType)
  }

  protectionFor(eventType: string): EventPayloadProtection {
    const definition = this.definitions.get(eventType)
    if (!definition)
      throw new UnknownEventTypeError(eventType)
    return definition.payloadProtection
  }

  normalizePending(event: PendingEvent): PendingEvent {
    return {
      ...event,
      schemaVersion: this.currentSchemaVersion(event.eventType),
      payload: this.decode(event.eventType, event.schemaVersion, event.payload),
    }
  }

  normalizeStored(event: StoredEvent): StoredEvent {
    return {
      ...event,
      schemaVersion: this.currentSchemaVersion(event.eventType),
      payload: this.decode(event.eventType, event.schemaVersion, event.payload),
    }
  }

  decode(eventType: string, schemaVersion: number, payload: unknown): JsonObject {
    const definition = this.definitions.get(eventType)
    if (!definition)
      throw new UnknownEventTypeError(eventType)
    if (!Number.isInteger(schemaVersion) || schemaVersion < 1 || schemaVersion > definition.currentSchemaVersion) {
      throw new UnsupportedEventVersionError(eventType, schemaVersion, definition.currentSchemaVersion)
    }

    let decoded = payload
    let version = schemaVersion
    try {
      while (version < definition.currentSchemaVersion) {
        const upcast = definition.upcasters[version]
        if (!upcast)
          throw new MissingEventUpcasterError(eventType, version)
        decoded = upcast(decoded)
        version += 1
      }
      return definition.validate(decoded)
    }
    catch (error: unknown) {
      if (error instanceof MissingEventUpcasterError)
        throw error
      throw new InvalidEventPayloadError(eventType, version, error)
    }
  }

  private currentSchemaVersion(eventType: string): number {
    const definition = this.definitions.get(eventType)
    if (!definition)
      throw new UnknownEventTypeError(eventType)
    return definition.currentSchemaVersion
  }
}
