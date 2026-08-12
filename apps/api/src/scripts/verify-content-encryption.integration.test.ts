import type { CommandEnvelope } from '../eventing'
import { eq } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { db, sql } from '../db'
import { aggregateSnapshots, commandReceipts, domainEvents } from '../db/schema'
import { commandBus, eventStore } from '../eventing-runtime'
import {
  CREATE_PROJECT_COMMAND,
  DELETE_PROJECT_COMMAND,
} from '../modules/project/project.eventing'
import { resetTestDatabase } from '../test/database'
import { verifyContentEncryption } from './verify-content-encryption'

afterAll(() => sql.end())

describe('verifyContentEncryption', () => {
  beforeEach(resetTestDatabase)

  it('reports plaintext protected rows by category and record id without returning content', async () => {
    const knownPlaintext = 'scanner plaintext must never be returned'

    await expect(db.transaction(async (transaction) => {
      await transaction.insert(domainEvents).values({
        eventId: 'plaintext-event',
        aggregateType: 'Project',
        aggregateId: 'scanner-project',
        aggregateVersion: 1,
        projectId: 'scanner-project',
        eventType: 'ProjectCreated',
        schemaVersion: 1,
        payload: { title: knownPlaintext },
        metadata: { actorType: 'test' },
        commandId: 'plaintext-event-command',
        eventIndex: 0,
        correlationId: 'plaintext-event-command',
        occurredAt: '2026-08-12T00:00:00.000Z',
      })
      await transaction.insert(aggregateSnapshots).values({
        aggregateType: 'Project',
        aggregateId: 'scanner-project',
        projectId: 'scanner-project',
        aggregateVersion: 1,
        schemaVersion: 1,
        state: { title: knownPlaintext },
        createdAt: '2026-08-12T00:00:00.000Z',
      })
      await transaction.insert(commandReceipts).values({
        commandId: 'plaintext-receipt',
        commandType: CREATE_PROJECT_COMMAND,
        aggregateType: 'Project',
        aggregateId: 'scanner-project',
        projectId: 'scanner-project',
        status: 'completed',
        result: { title: knownPlaintext },
        finishedAt: '2026-08-12T00:00:00.000Z',
      })
      await transaction.insert(commandReceipts).values({
        commandId: 'null-receipt',
        commandType: CREATE_PROJECT_COMMAND,
        aggregateType: 'Project',
        aggregateId: 'scanner-project',
        projectId: 'scanner-project',
        status: 'completed',
        result: null,
        finishedAt: '2026-08-12T00:00:00.000Z',
      })

      const report = await verifyContentEncryption(
        'scanner-project',
        [knownPlaintext],
        transaction,
      )

      expect(report.ok).toBe(false)
      expect(report.findings).toEqual(expect.arrayContaining([
        {
          category: 'event-envelope-invalid',
          recordId: 'plaintext-event',
          recordType: 'event',
        },
        {
          category: 'snapshot-envelope-invalid',
          recordId: 'Project/scanner-project',
          recordType: 'snapshot',
        },
        {
          category: 'receipt-wrapper-invalid',
          recordId: 'plaintext-receipt',
          recordType: 'receipt',
        },
        {
          category: 'receipt-wrapper-invalid',
          recordId: 'null-receipt',
          recordType: 'receipt',
        },
        {
          category: 'known-plaintext-found',
          recordId: 'plaintext-event',
          recordType: 'event',
        },
      ]))
      expect(JSON.stringify(report)).not.toContain(knownPlaintext)

      throw new Error('ROLLBACK_ENCRYPTION_SCANNER_FIXTURES')
    })).rejects.toThrow('ROLLBACK_ENCRYPTION_SCANNER_FIXTURES')

    await expect(db.select({ eventId: domainEvents.eventId })
      .from(domainEvents)
      .where(eq(domainEvents.eventId, 'plaintext-event')))
      .resolves
      .toEqual([])
  })

  it('accepts exact protected structures and recognizes a deleted project tombstone without decrypting it', async () => {
    await commandBus.dispatch(projectCommand(
      CREATE_PROJECT_COMMAND,
      'active-project',
      'create-active-project',
      { title: 'Active encrypted title' },
    ))
    await eventStore.withTransaction(session => session.putSnapshot({
      aggregateType: 'Project',
      aggregateId: 'active-project',
      projectId: 'active-project',
      aggregateVersion: 1,
      schemaVersion: 1,
      state: { title: 'Active encrypted title' },
      createdAt: '2026-08-12T00:00:00.000Z',
    }))
    await commandBus.dispatch(projectCommand(
      CREATE_PROJECT_COMMAND,
      'deleted-project',
      'create-deleted-project',
      { title: 'Deleted encrypted title' },
    ))
    await commandBus.dispatch(projectCommand(
      DELETE_PROJECT_COMMAND,
      'deleted-project',
      'delete-project',
      {},
    ))

    await expect(verifyContentEncryption(undefined, [
      'Active encrypted title',
      'Deleted encrypted title',
    ])).resolves.toMatchObject({
      ok: true,
      findings: [],
      tombstonedProjects: 1,
    })
  })
})

function projectCommand(
  commandType: string,
  projectId: string,
  commandId: string,
  payload: Record<string, unknown>,
): CommandEnvelope {
  return {
    commandId,
    commandType,
    aggregateType: 'Project',
    aggregateId: projectId,
    projectId,
    correlationId: commandId,
    payload,
  }
}
