import type { db } from '../db'
import type { EncryptedJsonEnvelope } from '../security/project-content-crypto'
import type { ProjectDataKeyStore } from '../security/project-data-key.store'
import type { EventRegistry } from './event-registry'
import type { EventingTransaction } from './event-store'
import type {
  AggregateSnapshot,
  CommandEnvelope,
  CommandReceiptRecord,
  JsonObject,
  StoredEvent,
} from './event-types'
import {
  decryptProjectJson,
  encryptProjectJson,
} from '../security/project-content-crypto'

export type EventingExecutor = Pick<typeof db, 'select'> | EventingTransaction

export interface EventingContentProtector {
  protectEvent: (executor: EventingExecutor, event: StoredEvent) => Promise<JsonObject>
  unprotectEvent: (executor: EventingExecutor, event: StoredEvent) => Promise<JsonObject>
  protectSnapshot: (executor: EventingExecutor, snapshot: AggregateSnapshot) => Promise<JsonObject>
  unprotectSnapshot: (executor: EventingExecutor, snapshot: AggregateSnapshot) => Promise<JsonObject>
  protectReceiptResult: (
    executor: EventingExecutor,
    command: CommandEnvelope,
    result: JsonObject,
  ) => Promise<JsonObject>
  unprotectReceiptResult: (
    executor: EventingExecutor,
    receipt: CommandReceiptRecord,
  ) => Promise<JsonObject>
  finalizeBatch: (executor: EventingExecutor, events: StoredEvent[]) => Promise<void>
}

export interface ProjectLifecycleEventTypes {
  projectCreatedEventType: string
  projectDeletedEventType: string
}

export class NoopEventingContentProtector implements EventingContentProtector {
  async protectEvent(_executor: EventingExecutor, event: StoredEvent): Promise<JsonObject> {
    return event.payload
  }

  async unprotectEvent(_executor: EventingExecutor, event: StoredEvent): Promise<JsonObject> {
    return event.payload
  }

  async protectSnapshot(_executor: EventingExecutor, snapshot: AggregateSnapshot): Promise<JsonObject> {
    return snapshot.state
  }

  async unprotectSnapshot(_executor: EventingExecutor, snapshot: AggregateSnapshot): Promise<JsonObject> {
    return snapshot.state
  }

  async protectReceiptResult(
    _executor: EventingExecutor,
    _command: CommandEnvelope,
    result: JsonObject,
  ): Promise<JsonObject> {
    return result
  }

  async unprotectReceiptResult(
    _executor: EventingExecutor,
    receipt: CommandReceiptRecord,
  ): Promise<JsonObject> {
    return receiptResult(receipt)
  }

  async finalizeBatch(_executor: EventingExecutor, _events: StoredEvent[]): Promise<void> {}
}

export class ProjectEventingContentProtector implements EventingContentProtector {
  constructor(
    private readonly registry: EventRegistry,
    private readonly keys: ProjectDataKeyStore,
    private readonly lifecycleEvents: ProjectLifecycleEventTypes,
  ) {}

  async protectEvent(executor: EventingExecutor, event: StoredEvent): Promise<JsonObject> {
    if (this.registry.protectionFor(event.eventType) === 'none')
      return event.payload

    const projectId = requiredProjectId(event.projectId, 'event')
    const dataKey = event.eventType === this.lifecycleEvents.projectCreatedEventType
      ? await this.keys.ensure(requiredTransaction(executor), projectId)
      : await this.keys.resolve(executor, projectId)
    return encryptProjectJson({
      key: dataKey.key,
      value: event.payload,
      aad: eventAad(event, projectId),
    })
  }

  async unprotectEvent(executor: EventingExecutor, event: StoredEvent): Promise<JsonObject> {
    if (this.registry.protectionFor(event.eventType) === 'none')
      return event.payload

    const projectId = requiredProjectId(event.projectId, 'event')
    const dataKey = await this.keys.resolve(executor, projectId)
    return decryptProjectJson({
      key: dataKey.key,
      envelope: event.payload as EncryptedJsonEnvelope,
      aad: eventAad(event, projectId),
    })
  }

  async protectSnapshot(executor: EventingExecutor, snapshot: AggregateSnapshot): Promise<JsonObject> {
    if (!snapshot.projectId)
      return snapshot.state

    const dataKey = await this.keys.resolve(executor, snapshot.projectId)
    return encryptProjectJson({
      key: dataKey.key,
      value: snapshot.state,
      aad: snapshotAad(snapshot, snapshot.projectId),
    })
  }

  async unprotectSnapshot(executor: EventingExecutor, snapshot: AggregateSnapshot): Promise<JsonObject> {
    if (!snapshot.projectId)
      return snapshot.state

    const dataKey = await this.keys.resolve(executor, snapshot.projectId)
    return decryptProjectJson({
      key: dataKey.key,
      envelope: snapshot.state as EncryptedJsonEnvelope,
      aad: snapshotAad(snapshot, snapshot.projectId),
    })
  }

  async protectReceiptResult(
    executor: EventingExecutor,
    command: CommandEnvelope,
    result: JsonObject,
  ): Promise<JsonObject> {
    if (!command.projectId)
      return result

    const dataKey = await this.keys.resolve(executor, command.projectId)
    return encryptProjectJson({
      key: dataKey.key,
      value: result,
      aad: receiptAad(command, command.projectId),
    })
  }

  async unprotectReceiptResult(
    executor: EventingExecutor,
    receipt: CommandReceiptRecord,
  ): Promise<JsonObject> {
    const result = receiptResult(receipt)
    if (!receipt.projectId || !isEncryptedEnvelope(result))
      return result

    const dataKey = await this.keys.resolve(executor, receipt.projectId)
    return decryptProjectJson({
      key: dataKey.key,
      envelope: result as EncryptedJsonEnvelope,
      aad: receiptAad(receipt, receipt.projectId),
    })
  }

  async finalizeBatch(executor: EventingExecutor, events: StoredEvent[]): Promise<void> {
    for (const event of events) {
      if (event.eventType !== this.lifecycleEvents.projectDeletedEventType)
        continue
      await this.keys.destroy(
        requiredTransaction(executor),
        requiredProjectId(event.projectId, 'project deletion event'),
        event.occurredAt,
      )
    }
  }
}

function eventAad(event: StoredEvent, projectId: string): string {
  return [
    event.eventId,
    event.aggregateType,
    event.aggregateId,
    event.aggregateVersion,
    projectId,
    event.eventType,
    event.schemaVersion,
  ].join('|')
}

function snapshotAad(snapshot: AggregateSnapshot, projectId: string): string {
  return [
    'snapshot',
    snapshot.aggregateType,
    snapshot.aggregateId,
    snapshot.aggregateVersion,
    projectId,
    snapshot.schemaVersion,
  ].join('|')
}

function receiptAad(
  receipt: Pick<
    CommandEnvelope | CommandReceiptRecord,
    'commandId' | 'commandType' | 'aggregateType' | 'aggregateId'
  >,
  projectId: string,
): string {
  return [
    'receipt',
    receipt.commandId,
    receipt.commandType,
    receipt.aggregateType,
    receipt.aggregateId,
    projectId,
  ].join('|')
}

function requiredProjectId(projectId: string | undefined, subject: string): string {
  if (!projectId)
    throw new Error(`Protected ${subject} requires a project id`)
  return projectId
}

function requiredTransaction(executor: EventingExecutor): EventingTransaction {
  if (!('rollback' in executor))
    throw new Error('Project key mutation requires an eventing transaction')
  return executor
}

function receiptResult(receipt: CommandReceiptRecord): JsonObject {
  if (!isJsonObject(receipt.result))
    throw new Error('Completed command receipt requires a JSON result')
  return receipt.result
}

function isJsonObject(value: JsonObject | null): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isEncryptedEnvelope(value: JsonObject): value is EncryptedJsonEnvelope {
  return value.encrypted === true
    && value.algorithm === 'aes-256-gcm'
    && value.keyVersion === 1
    && typeof value.iv === 'string'
    && typeof value.ciphertext === 'string'
    && typeof value.authTag === 'string'
}
