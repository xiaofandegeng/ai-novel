import type { CredentialKind } from '../db/schema'
import type { EventingTransaction } from '../eventing'
import { Buffer } from 'node:buffer'
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import process from 'node:process'
import { and, eq } from 'drizzle-orm'
import { getCredentialMasterKey } from '../config/environment'
import { db } from '../db'
import { credentialVaultEntries } from '../db/schema'
import { generateId, now } from '../shared/utils'

const ALGORITHM = 'aes-256-gcm'
const INITIALIZATION_VECTOR_BYTES = 12
const KEY_BYTES = 32
const CURRENT_KEY_VERSION = 1

export interface CredentialReference {
  credentialRef: string
  projectId: string
  kind: CredentialKind
  maskedSuffix: string
  keyVersion: number
}

export interface StoreCredentialInput {
  projectId: string
  kind: CredentialKind
  secret: string
}

export interface ReplaceCredentialInput extends StoreCredentialInput {
  previousCredentialRef?: string
}

export interface ResolveCredentialInput {
  credentialRef: string
  projectId: string
  kind: CredentialKind
}

export class InvalidCredentialMasterKeyError extends Error {
  constructor() {
    super('AI_CREDENTIAL_MASTER_KEY must be a base64-encoded 32-byte key')
    this.name = 'InvalidCredentialMasterKeyError'
  }
}

export class CredentialDecryptionError extends Error {
  constructor(readonly credentialRef: string, options?: ErrorOptions) {
    super('Credential could not be decrypted', options)
    this.name = 'CredentialDecryptionError'
  }
}

export class CredentialVault {
  private constructor(private readonly key: Buffer) {}

  static fromEnvironment(env: NodeJS.ProcessEnv = process.env): CredentialVault {
    return CredentialVault.fromBase64Key(getCredentialMasterKey(env))
  }

  static fromBase64Key(encodedKey: string | undefined): CredentialVault {
    if (!encodedKey || !/^[a-z0-9+/]+={0,2}$/i.test(encodedKey))
      throw new InvalidCredentialMasterKeyError()
    const key = Buffer.from(encodedKey, 'base64')
    if (key.length !== KEY_BYTES || key.toString('base64') !== encodedKey)
      throw new InvalidCredentialMasterKeyError()
    return new CredentialVault(key)
  }

  async store(input: StoreCredentialInput): Promise<CredentialReference> {
    const encrypted = this.encrypt(input)
    await db.insert(credentialVaultEntries).values(encrypted)
    return toReference(encrypted)
  }

  async replace(input: ReplaceCredentialInput): Promise<CredentialReference> {
    const encrypted = this.encrypt(input)
    await db.transaction(async (transaction) => {
      await transaction.insert(credentialVaultEntries).values(encrypted)
      if (input.previousCredentialRef) {
        await transaction.delete(credentialVaultEntries)
          .where(and(
            eq(credentialVaultEntries.id, input.previousCredentialRef),
            eq(credentialVaultEntries.projectId, input.projectId),
            eq(credentialVaultEntries.kind, input.kind),
          ))
      }
    })
    return toReference(encrypted)
  }

  async resolve(input: ResolveCredentialInput): Promise<string | null> {
    const [entry] = await db.select()
      .from(credentialVaultEntries)
      .where(and(
        eq(credentialVaultEntries.id, input.credentialRef),
        eq(credentialVaultEntries.projectId, input.projectId),
        eq(credentialVaultEntries.kind, input.kind),
      ))
      .limit(1)
    if (!entry)
      return null

    try {
      const decipher = createDecipheriv(
        ALGORITHM,
        this.key,
        Buffer.from(entry.initializationVector, 'base64'),
      )
      decipher.setAAD(Buffer.from(aad(entry)))
      decipher.setAuthTag(Buffer.from(entry.authenticationTag, 'base64'))
      return Buffer.concat([
        decipher.update(Buffer.from(entry.ciphertext, 'base64')),
        decipher.final(),
      ]).toString('utf8')
    }
    catch (error: unknown) {
      throw new CredentialDecryptionError(input.credentialRef, { cause: error })
    }
  }

  async delete(credentialRef: string, projectId: string): Promise<boolean> {
    const deleted = await db.delete(credentialVaultEntries)
      .where(and(
        eq(credentialVaultEntries.id, credentialRef),
        eq(credentialVaultEntries.projectId, projectId),
      ))
      .returning({ id: credentialVaultEntries.id })
    return deleted.length > 0
  }

  async deleteProject(projectId: string): Promise<number> {
    const deleted = await db.delete(credentialVaultEntries)
      .where(eq(credentialVaultEntries.projectId, projectId))
      .returning({ id: credentialVaultEntries.id })
    return deleted.length
  }

  private encrypt(input: StoreCredentialInput): typeof credentialVaultEntries.$inferInsert {
    if (!input.projectId || !input.secret)
      throw new Error('Project ID and credential secret are required')

    const id = generateId()
    const initializationVector = randomBytes(INITIALIZATION_VECTOR_BYTES)
    const timestamp = now()
    const identity = {
      id,
      projectId: input.projectId,
      kind: input.kind,
      keyVersion: CURRENT_KEY_VERSION,
    }
    const cipher = createCipheriv(ALGORITHM, this.key, initializationVector)
    cipher.setAAD(Buffer.from(aad(identity)))
    const ciphertext = Buffer.concat([
      cipher.update(input.secret, 'utf8'),
      cipher.final(),
    ])

    return {
      ...identity,
      ciphertext: ciphertext.toString('base64'),
      initializationVector: initializationVector.toString('base64'),
      authenticationTag: cipher.getAuthTag().toString('base64'),
      maskedSuffix: input.secret.slice(-4),
      createdAt: timestamp,
      updatedAt: timestamp,
    }
  }
}

export async function deleteProjectCredentials(
  transaction: EventingTransaction,
  projectId: string,
): Promise<void> {
  await transaction.delete(credentialVaultEntries)
    .where(eq(credentialVaultEntries.projectId, projectId))
}

function aad(input: {
  id: string
  projectId: string
  kind: CredentialKind
  keyVersion: number
}): string {
  return `${input.projectId}:${input.kind}:${input.id}:${input.keyVersion}`
}

function toReference(entry: typeof credentialVaultEntries.$inferInsert): CredentialReference {
  return {
    credentialRef: entry.id,
    projectId: entry.projectId,
    kind: entry.kind,
    maskedSuffix: entry.maskedSuffix,
    keyVersion: entry.keyVersion,
  }
}
