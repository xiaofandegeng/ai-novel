import type { db } from '../db'
import type { EventingTransaction } from '../eventing'
import { Buffer } from 'node:buffer'
import { and, eq, isNull } from 'drizzle-orm'
import { getProjectContentMasterKey } from '../config/environment'
import { projectDataKeys } from '../db/schema'
import {
  decryptProjectJson,
  encryptProjectJson,
  generateProjectDataKey,
} from './project-content-crypto'

const ALGORITHM = 'aes-256-gcm' as const
const CURRENT_KEY_VERSION = 1 as const

type ProjectDataKeyExecutor = Pick<typeof db, 'select'>

export interface ProjectDataKey {
  key: Buffer
  keyVersion: typeof CURRENT_KEY_VERSION
  algorithm: typeof ALGORITHM
}

export class ProjectDataKeyDestroyedError extends Error {
  constructor(readonly projectId: string) {
    super('Project data key has been destroyed')
    this.name = 'ProjectDataKeyDestroyedError'
  }
}

export class ProjectDataKeyStore {
  constructor(private readonly masterKey = getProjectContentMasterKey()) {}

  async ensure(transaction: EventingTransaction, projectId: string): Promise<ProjectDataKey> {
    const existing = await findRow(transaction, projectId)
    if (existing)
      return unwrapRow(this.masterKey, existing)

    const key = generateProjectDataKey()
    const wrappedKey = encryptProjectJson({
      key: this.masterKey,
      value: { key: key.toString('base64') },
      aad: keyAad(projectId),
    })
    const inserted = await transaction.insert(projectDataKeys)
      .values({
        projectId,
        wrappedKey,
        keyVersion: CURRENT_KEY_VERSION,
        algorithm: ALGORITHM,
      })
      .onConflictDoNothing()
      .returning({ projectId: projectDataKeys.projectId })

    if (inserted.length === 0)
      return this.resolve(transaction, projectId)

    return { key, keyVersion: CURRENT_KEY_VERSION, algorithm: ALGORITHM }
  }

  async resolve(executor: ProjectDataKeyExecutor, projectId: string): Promise<ProjectDataKey> {
    const row = await findRow(executor, projectId)
    if (!row)
      throw new Error('Project data key does not exist')
    return unwrapRow(this.masterKey, row)
  }

  async lockForDestruction(
    transaction: EventingTransaction,
    projectId: string,
  ): Promise<void> {
    const [row] = await transaction.select({ projectId: projectDataKeys.projectId })
      .from(projectDataKeys)
      .where(eq(projectDataKeys.projectId, projectId))
      .for('update')
      .limit(1)
    if (!row)
      throw new Error('Project data key does not exist')
  }

  async destroy(
    transaction: EventingTransaction,
    projectId: string,
    destroyedAt: string,
  ): Promise<void> {
    await transaction.update(projectDataKeys)
      .set({ wrappedKey: null, destroyedAt })
      .where(and(
        eq(projectDataKeys.projectId, projectId),
        isNull(projectDataKeys.destroyedAt),
      ))
  }
}

async function findRow(executor: ProjectDataKeyExecutor, projectId: string) {
  const [row] = await executor.select()
    .from(projectDataKeys)
    .where(eq(projectDataKeys.projectId, projectId))
    .limit(1)
  return row
}

function unwrapRow(
  masterKey: Buffer,
  row: typeof projectDataKeys.$inferSelect,
): ProjectDataKey {
  if (row.wrappedKey === null || row.destroyedAt !== null)
    throw new ProjectDataKeyDestroyedError(row.projectId)
  if (row.keyVersion !== CURRENT_KEY_VERSION || row.algorithm !== ALGORITHM)
    throw new Error('Unsupported project data key metadata')

  const plaintext = decryptProjectJson({
    key: masterKey,
    envelope: row.wrappedKey,
    aad: keyAad(row.projectId),
  })
  if (typeof plaintext.key !== 'string')
    throw new Error('Invalid wrapped project data key')

  const key = Buffer.from(plaintext.key, 'base64')
  if (key.length !== 32 || key.toString('base64') !== plaintext.key)
    throw new Error('Invalid wrapped project data key')

  return { key, keyVersion: CURRENT_KEY_VERSION, algorithm: ALGORITHM }
}

function keyAad(projectId: string): string {
  return `project-data-key|${projectId}|${CURRENT_KEY_VERSION}`
}
