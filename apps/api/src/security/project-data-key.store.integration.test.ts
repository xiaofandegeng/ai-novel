import { eq } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { db, sql } from '../db'
import { projectDataKeys } from '../db/schema'
import { EventStore } from '../eventing'
import { resetTestDatabase } from '../test/database'
import {
  ProjectDataKeyDestroyedError,
  ProjectDataKeyStore,
} from './project-data-key.store'

afterAll(() => sql.end())

describe('project data key store', () => {
  const store = new EventStore()
  const keys = new ProjectDataKeyStore()

  beforeEach(resetTestDatabase)

  it('creates one wrapped key and destroys it without deleting the tombstone', async () => {
    let plaintextKey = ''

    await store.withTransaction(async (session) => {
      const first = await keys.ensure(session.transaction, 'project-a')
      const second = await keys.ensure(session.transaction, 'project-a')
      plaintextKey = first.key.toString('base64')
      expect(second.key).toEqual(first.key)

      const activeRows = await session.transaction.select().from(projectDataKeys)
      expect(activeRows).toHaveLength(1)
      expect(activeRows[0]?.wrappedKey).not.toBeNull()
      expect(JSON.stringify(activeRows[0])).not.toContain(plaintextKey)

      await keys.destroy(session.transaction, 'project-a', '2026-08-12T00:00:00.000Z')
    })

    await expect(keys.resolve(db, 'project-a')).rejects.toBeInstanceOf(ProjectDataKeyDestroyedError)
    const [row] = await db.select().from(projectDataKeys)
    expect(row).toMatchObject({
      projectId: 'project-a',
      wrappedKey: null,
      keyVersion: 1,
      algorithm: 'aes-256-gcm',
    })
    expect(new Date(row!.destroyedAt!).toISOString())
      .toBe('2026-08-12T00:00:00.000Z')
  })

  it('binds wrapped key authentication to its project id', async () => {
    await store.withTransaction(session => keys.ensure(session.transaction, 'project-a'))
    await db.update(projectDataKeys)
      .set({ projectId: 'project-b' })
      .where(eq(projectDataKeys.projectId, 'project-a'))

    await expect(keys.resolve(db, 'project-b')).rejects.toThrow()
  })

  it('enforces active and destroyed row shapes in PostgreSQL', async () => {
    await expect(db.insert(projectDataKeys).values({
      projectId: 'invalid-empty',
      wrappedKey: null,
      keyVersion: 1,
      algorithm: 'aes-256-gcm',
    })).rejects.toThrow()

    await store.withTransaction(session => keys.ensure(session.transaction, 'invalid-active'))
    await expect(db.update(projectDataKeys)
      .set({ destroyedAt: '2026-08-12T00:00:00.000Z' })
      .where(eq(projectDataKeys.projectId, 'invalid-active'))).rejects.toThrow()
  })
})
