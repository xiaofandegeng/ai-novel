import type { db } from '../db'
import type { JsonObject } from './event-types'
import { eq } from 'drizzle-orm'
import {
  aggregateSnapshots,
  commandReceipts,
  domainEvents,
  projectDataKeys,
} from '../db/schema'

export type ContentEncryptionRecordExecutor = Pick<typeof db, 'select'>

export interface ProjectSnapshotEncryptionRecord {
  aggregateType: string
  aggregateId: string
  projectId: string
  state: JsonObject
}

export interface ProjectReceiptEncryptionRecord {
  commandId: string
  commandType: string
  projectId: string
  result: JsonObject | null
}

export async function readContentEncryptionRecords(
  executor: ContentEncryptionRecordExecutor,
  projectId?: string,
) {
  const [events, snapshots, receipts, keys] = await Promise.all([
    selectEvents(executor, projectId),
    selectSnapshots(executor, projectId),
    selectReceipts(executor, projectId),
    selectProjectKeys(executor, projectId),
  ])
  return { events, snapshots, receipts, keys }
}

async function selectEvents(executor: ContentEncryptionRecordExecutor, projectId?: string) {
  const query = executor.select({
    eventId: domainEvents.eventId,
    eventType: domainEvents.eventType,
    projectId: domainEvents.projectId,
    payload: domainEvents.payload,
  }).from(domainEvents)
  return projectId ? query.where(eq(domainEvents.projectId, projectId)) : query
}

async function selectSnapshots(executor: ContentEncryptionRecordExecutor, projectId?: string) {
  const query = executor.select({
    aggregateType: aggregateSnapshots.aggregateType,
    aggregateId: aggregateSnapshots.aggregateId,
    projectId: aggregateSnapshots.projectId,
    state: aggregateSnapshots.state,
  }).from(aggregateSnapshots)
  const rows = projectId
    ? await query.where(eq(aggregateSnapshots.projectId, projectId))
    : await query
  return rows.filter((row): row is ProjectSnapshotEncryptionRecord => row.projectId !== null)
}

async function selectReceipts(executor: ContentEncryptionRecordExecutor, projectId?: string) {
  const query = executor.select({
    commandId: commandReceipts.commandId,
    commandType: commandReceipts.commandType,
    projectId: commandReceipts.projectId,
    status: commandReceipts.status,
    result: commandReceipts.result,
  }).from(commandReceipts)
  const rows = projectId
    ? await query.where(eq(commandReceipts.projectId, projectId))
    : await query
  return rows.filter((row): row is ProjectReceiptEncryptionRecord & { status: 'completed' } => (
    row.status === 'completed' && row.projectId !== null
  ))
}

async function selectProjectKeys(executor: ContentEncryptionRecordExecutor, projectId?: string) {
  const query = executor.select().from(projectDataKeys)
  return projectId ? query.where(eq(projectDataKeys.projectId, projectId)) : query
}
