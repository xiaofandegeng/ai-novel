export type JsonObject = Record<string, unknown>

export type EventPayloadProtection = 'none' | 'project-content'

export type CommandReceiptProtection = 'none' | 'project-content'

export interface StreamRef {
  aggregateType: string
  aggregateId: string
  projectId?: string
}

export interface PendingEvent<TPayload extends JsonObject = JsonObject> {
  eventId: string
  eventType: string
  schemaVersion: number
  payload: TPayload
  metadata: JsonObject
  occurredAt: string
}

export interface StoredEvent<TPayload extends JsonObject = JsonObject> extends PendingEvent<TPayload>, StreamRef {
  globalPosition: number
  aggregateVersion: number
  commandId: string
  eventIndex: number
  correlationId: string
  causationId?: string
}

export interface StreamAppend {
  stream: StreamRef
  expectedVersion: number
  events: PendingEvent[]
}

export interface AppendBatch {
  commandId: string
  correlationId: string
  causationId?: string
  streams: StreamAppend[]
}

export interface CommandEnvelope<TPayload extends JsonObject = JsonObject> {
  commandId: string
  commandType: string
  aggregateType: string
  aggregateId: string
  projectId?: string
  correlationId: string
  causationId?: string
  payload: TPayload
}

export interface CommandReceiptRecord {
  commandId: string
  commandType: string
  aggregateType: string
  aggregateId: string
  projectId?: string | null
  status: 'completed' | 'failed'
  result: JsonObject | null
  errorCode?: string | null
  errorMessage?: string | null
  createdAt: string
  finishedAt: string
}

export interface OutboxIntent {
  id: string
  eventId: string
  handlerName: string
  payload: JsonObject
  availableAt?: string
}

export interface CommandDecision<TResult> {
  streams: StreamAppend[]
  result: TResult
  receiptProtection?: CommandReceiptProtection
  outbox?: OutboxIntent[]
}

export interface AggregateSnapshot<TState extends JsonObject = JsonObject> extends StreamRef {
  aggregateVersion: number
  schemaVersion: number
  state: TState
  createdAt: string
}
