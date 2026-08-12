import { Buffer } from 'node:buffer'
import { eq } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { db, sql } from '../db'
import { credentialVaultEntries } from '../db/schema'
import { resetTestDatabase } from '../test/database'
import {
  CredentialDecryptionError,
  CredentialVault,
  InvalidCredentialMasterKeyError,
} from './credential-vault'

const firstKey = Buffer.alloc(32, 1).toString('base64')
const secondKey = Buffer.alloc(32, 2).toString('base64')

afterAll(() => sql.end())

describe('credentialVault', () => {
  beforeEach(resetTestDatabase)

  it('stores only authenticated ciphertext and resolves it inside the owning project', async () => {
    const vault = CredentialVault.fromBase64Key(firstKey)
    const reference = await vault.store({
      projectId: 'project-1',
      kind: 'chat',
      secret: 'sk-private-value',
    })

    expect(reference).toMatchObject({
      projectId: 'project-1',
      kind: 'chat',
      maskedSuffix: 'alue',
    })
    await expect(vault.resolve({
      projectId: 'project-1',
      kind: 'chat',
      credentialRef: reference.credentialRef,
    })).resolves.toBe('sk-private-value')

    const [stored] = await db.select()
      .from(credentialVaultEntries)
      .where(eq(credentialVaultEntries.id, reference.credentialRef))
    expect(JSON.stringify(stored)).not.toContain('sk-private-value')
    expect(stored).toMatchObject({ keyVersion: 1, maskedSuffix: 'alue' })
  })

  it('does not reveal whether another project owns a credential reference', async () => {
    const vault = CredentialVault.fromBase64Key(firstKey)
    const reference = await vault.store({
      projectId: 'project-1',
      kind: 'embedding',
      secret: 'embedding-secret',
    })

    await expect(vault.resolve({
      projectId: 'project-2',
      kind: 'embedding',
      credentialRef: reference.credentialRef,
    })).resolves.toBeNull()
  })

  it('atomically replaces a credential and removes the superseded ciphertext', async () => {
    const vault = CredentialVault.fromBase64Key(firstKey)
    const first = await vault.store({
      projectId: 'project-1',
      kind: 'chat',
      secret: 'first-secret',
    })

    const replacement = await vault.replace({
      projectId: 'project-1',
      kind: 'chat',
      secret: 'replacement-secret',
      previousCredentialRef: first.credentialRef,
    })

    expect(replacement.credentialRef).not.toBe(first.credentialRef)
    await expect(vault.resolve({
      projectId: 'project-1',
      kind: 'chat',
      credentialRef: first.credentialRef,
    })).resolves.toBeNull()
    await expect(vault.resolve({
      projectId: 'project-1',
      kind: 'chat',
      credentialRef: replacement.credentialRef,
    })).resolves.toBe('replacement-secret')
  })

  it('deletes every credential owned by a deleted project', async () => {
    const vault = CredentialVault.fromBase64Key(firstKey)
    await vault.store({ projectId: 'project-1', kind: 'chat', secret: 'chat-secret' })
    await vault.store({ projectId: 'project-1', kind: 'embedding', secret: 'embedding-secret' })
    await vault.store({ projectId: 'project-2', kind: 'chat', secret: 'preserved-secret' })

    await expect(vault.deleteProject('project-1')).resolves.toBe(2)

    const remaining = await db.select().from(credentialVaultEntries)
    expect(remaining).toMatchObject([{ projectId: 'project-2' }])
  })

  it('fails closed when ciphertext is opened with a different master key', async () => {
    const firstVault = CredentialVault.fromBase64Key(firstKey)
    const reference = await firstVault.store({
      projectId: 'project-1',
      kind: 'chat',
      secret: 'key-bound-secret',
    })
    const secondVault = CredentialVault.fromBase64Key(secondKey)

    await expect(secondVault.resolve({
      projectId: 'project-1',
      kind: 'chat',
      credentialRef: reference.credentialRef,
    })).rejects.toBeInstanceOf(CredentialDecryptionError)
  })

  it('rejects missing, malformed, and incorrectly sized master keys', () => {
    for (const key of [undefined, 'not-base64', Buffer.alloc(16).toString('base64')]) {
      expect(() => CredentialVault.fromBase64Key(key))
        .toThrow(InvalidCredentialMasterKeyError)
    }
  })
})
