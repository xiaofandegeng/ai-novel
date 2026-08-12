import type { JsonObject } from '../eventing/event-types'
import { Buffer } from 'node:buffer'
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

const ALGORITHM = 'aes-256-gcm'
const INITIALIZATION_VECTOR_BYTES = 12
const KEY_BYTES = 32
const CURRENT_KEY_VERSION = 1

export interface EncryptedJsonEnvelope extends JsonObject {
  encrypted: true
  algorithm: 'aes-256-gcm'
  keyVersion: 1
  iv: string
  ciphertext: string
  authTag: string
}

export interface ProjectJsonEncryptionInput {
  key: Buffer
  value: JsonObject
  aad: string
}

export interface ProjectJsonDecryptionInput {
  key: Buffer
  envelope: EncryptedJsonEnvelope
  aad: string
}

export function parseProjectContentMasterKey(value: string | undefined): Buffer {
  if (!value || !/^[a-z0-9+/]+={0,2}$/i.test(value))
    throw new Error('PROJECT_CONTENT_MASTER_KEY must be a base64-encoded 32 bytes key')

  const key = Buffer.from(value, 'base64')
  if (key.length !== KEY_BYTES || key.toString('base64') !== value)
    throw new Error('PROJECT_CONTENT_MASTER_KEY must be a base64-encoded 32 bytes key')

  return key
}

export function encryptProjectJson(input: ProjectJsonEncryptionInput): EncryptedJsonEnvelope {
  assertProjectDataKey(input.key)

  const iv = randomBytes(INITIALIZATION_VECTOR_BYTES)
  const cipher = createCipheriv(ALGORITHM, input.key, iv)
  cipher.setAAD(Buffer.from(input.aad, 'utf8'))
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(input.value), 'utf8'),
    cipher.final(),
  ])

  return {
    encrypted: true,
    algorithm: ALGORITHM,
    keyVersion: CURRENT_KEY_VERSION,
    iv: iv.toString('base64'),
    ciphertext: ciphertext.toString('base64'),
    authTag: cipher.getAuthTag().toString('base64'),
  }
}

export function decryptProjectJson(input: ProjectJsonDecryptionInput): JsonObject {
  assertProjectDataKey(input.key)

  const decipher = createDecipheriv(ALGORITHM, input.key, Buffer.from(input.envelope.iv, 'base64'))
  decipher.setAAD(Buffer.from(input.aad, 'utf8'))
  decipher.setAuthTag(Buffer.from(input.envelope.authTag, 'base64'))
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(input.envelope.ciphertext, 'base64')),
    decipher.final(),
  ]).toString('utf8')
  const value: unknown = JSON.parse(plaintext)

  if (!isJsonObject(value))
    throw new Error('Decrypted project content must be a JSON object')

  return value
}

export function generateProjectDataKey(): Buffer {
  return randomBytes(KEY_BYTES)
}

function assertProjectDataKey(key: Buffer): void {
  if (key.length !== KEY_BYTES)
    throw new Error('Project data key must be 32 bytes')
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
