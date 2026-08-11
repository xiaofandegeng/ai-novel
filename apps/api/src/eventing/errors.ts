import type { JsonObject, StreamRef } from './event-types'

export class EventingError extends Error {
  constructor(
    message: string,
    readonly code: string,
    options?: ErrorOptions,
  ) {
    super(message, options)
    this.name = new.target.name
  }
}

export class EventConcurrencyError extends EventingError {
  constructor(
    readonly stream: StreamRef,
    readonly expectedVersion: number,
    readonly actualVersion: number,
  ) {
    super(
      `Event stream ${stream.aggregateType}/${stream.aggregateId} expected version ${expectedVersion}, received ${actualVersion}`,
      'EVENT_CONCURRENCY_CONFLICT',
    )
  }
}

export class DuplicateEventError extends EventingError {
  constructor(readonly eventId: string) {
    super(`Event already exists: ${eventId}`, 'DUPLICATE_EVENT')
  }
}

export class UnknownEventTypeError extends EventingError {
  constructor(readonly eventType: string) {
    super(`Unknown event type: ${eventType}`, 'UNKNOWN_EVENT_TYPE')
  }
}

export class DuplicateEventTypeError extends EventingError {
  constructor(readonly eventType: string) {
    super(`Event type already registered: ${eventType}`, 'DUPLICATE_EVENT_TYPE')
  }
}

export class UnsupportedEventVersionError extends EventingError {
  constructor(
    readonly eventType: string,
    readonly schemaVersion: number,
    readonly currentSchemaVersion: number,
  ) {
    super(
      `Event ${eventType} schema version ${schemaVersion} is not supported; current version is ${currentSchemaVersion}`,
      'UNSUPPORTED_EVENT_VERSION',
    )
  }
}

export class MissingEventUpcasterError extends EventingError {
  constructor(readonly eventType: string, readonly fromSchemaVersion: number) {
    super(
      `Event ${eventType} is missing an upcaster from schema version ${fromSchemaVersion}`,
      'MISSING_EVENT_UPCASTER',
    )
  }
}

export class InvalidEventPayloadError extends EventingError {
  constructor(readonly eventType: string, readonly schemaVersion: number, cause: unknown) {
    super(
      `Event ${eventType} has an invalid payload at schema version ${schemaVersion}`,
      'INVALID_EVENT_PAYLOAD',
      { cause },
    )
  }
}

export class UnknownCommandTypeError extends EventingError {
  constructor(readonly commandType: string) {
    super(`Unknown command type: ${commandType}`, 'UNKNOWN_COMMAND_TYPE')
  }
}

export class DomainCommandError extends EventingError {
  constructor(code: string, message: string, readonly details: JsonObject = {}) {
    super(message, code)
  }
}

export class DuplicateProjectionError extends EventingError {
  constructor(readonly projectionName: string) {
    super(`Projection already registered: ${projectionName}`, 'DUPLICATE_PROJECTION')
  }
}

export class UnknownProjectionError extends EventingError {
  constructor(readonly projectionName: string) {
    super(`Unknown projection: ${projectionName}`, 'UNKNOWN_PROJECTION')
  }
}

export class DuplicateOutboxHandlerError extends EventingError {
  constructor(readonly handlerName: string) {
    super(`Outbox handler already registered: ${handlerName}`, 'DUPLICATE_OUTBOX_HANDLER')
  }
}

export class UnknownOutboxHandlerError extends EventingError {
  constructor(readonly handlerName: string) {
    super(`Unknown outbox handler: ${handlerName}`, 'UNKNOWN_OUTBOX_HANDLER')
  }
}
