import { describe, expect, it } from 'vitest'
import { assertNoKnownPlaintext } from './redacted-content-assertion'

describe('redacted protected-content assertion', () => {
  it('reports only record identity and category when a protected record contains a probe', () => {
    const knownPlaintext = '正文不得出现在失败输出'
    const rawEnvelope = {
      ciphertext: 'ciphertext-must-not-appear',
      authTag: 'auth-tag-must-not-appear',
      nested: { body: knownPlaintext },
    }
    let message = ''

    try {
      assertNoKnownPlaintext([{
        recordType: 'snapshot',
        recordId: 'Project/development-seed-project-v1',
        value: rawEnvelope,
      }], [knownPlaintext])
    }
    catch (error: unknown) {
      message = error instanceof Error ? error.message : String(error)
    }

    expect(message).toBe(
      'Protected content scan failed: snapshot/Project/development-seed-project-v1/known-plaintext-found',
    )
    expect(message.includes(knownPlaintext)).toBe(false)
    expect(message.includes(rawEnvelope.ciphertext)).toBe(false)
    expect(message.includes(rawEnvelope.authTag)).toBe(false)
  })
})
