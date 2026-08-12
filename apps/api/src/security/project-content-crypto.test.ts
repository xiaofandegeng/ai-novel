import { Buffer } from 'node:buffer'
import { describe, expect, it } from 'vitest'
import {
  decryptProjectJson,
  encryptProjectJson,
  generateProjectDataKey,
  parseProjectContentMasterKey,
} from './project-content-crypto'

describe('project content crypto', () => {
  it('rejects a missing or non-256-bit project content master key', () => {
    expect(() => parseProjectContentMasterKey(undefined)).toThrow('PROJECT_CONTENT_MASTER_KEY')
    expect(() => parseProjectContentMasterKey(Buffer.alloc(31).toString('base64'))).toThrow('32 bytes')
  })

  it('rejects malformed and non-canonical project content master keys', () => {
    const canonical = Buffer.alloc(32, 7).toString('base64')

    expect(() => parseProjectContentMasterKey('not*base64')).toThrow('PROJECT_CONTENT_MASTER_KEY')
    expect(() => parseProjectContentMasterKey(`${canonical}=`)).toThrow('PROJECT_CONTENT_MASTER_KEY')
  })

  it('authenticates ciphertext with project and event AAD', () => {
    const key = Buffer.alloc(32, 7)
    const envelope = encryptProjectJson({ key, value: { title: '雾港' }, aad: 'project-a|event-1' })

    expect(JSON.stringify(envelope)).not.toContain('雾港')
    expect(decryptProjectJson({ key, envelope, aad: 'project-a|event-1' })).toEqual({ title: '雾港' })
    expect(() => decryptProjectJson({ key, envelope, aad: 'project-b|event-1' })).toThrow()
  })

  it('rejects tampered encryption metadata before decrypting', () => {
    const key = Buffer.alloc(32, 7)
    const aad = 'project-a|event-1'

    const invalidMetadata: Array<[string, unknown]> = [
      ['encrypted', false],
      ['algorithm', 'aes-128-gcm'],
      ['keyVersion', 2],
    ]

    for (const [field, value] of invalidMetadata) {
      const envelope = encryptProjectJson({ key, value: { title: '雾港' }, aad })
      const tamperedEnvelope: Record<string, unknown> = envelope
      tamperedEnvelope[field] = value

      expect(() => decryptProjectJson({ key, envelope, aad }))
        .toThrow('Invalid project content encryption envelope')
    }
  })

  it('uses a fresh 12-byte IV for each encryption', () => {
    const key = Buffer.alloc(32, 7)
    const input = { key, value: { title: '雾港' }, aad: 'project-a|event-1' }

    const first = encryptProjectJson(input)
    const second = encryptProjectJson(input)

    expect(Buffer.from(first.iv, 'base64')).toHaveLength(12)
    expect(first.iv).not.toBe(second.iv)
  })

  it('generates 256-bit project data keys', () => {
    expect(generateProjectDataKey()).toHaveLength(32)
  })
})
