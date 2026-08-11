import { describe, expect, it } from 'vitest'
import { DomainCommandError } from './errors'
import { createPayloadCodec } from './payload-codecs'

describe('event payload codecs', () => {
  const payload = createPayloadCodec('INVALID_TEST_PAYLOAD', 'Test payload')

  it('reads normalized primitives and arrays', () => {
    const value = payload.object({
      name: '  林岚  ',
      note: null,
      count: 2,
      enabled: true,
      status: 'active',
      tags: [' one ', 'two'],
      children: [{ id: 'child-1' }],
    })

    expect(payload.string(value, 'name')).toBe('林岚')
    expect(payload.nullableString(value, 'note')).toBeNull()
    expect(payload.integer(value, 'count', { minimum: 1 })).toBe(2)
    expect(payload.boolean(value, 'enabled')).toBe(true)
    expect(payload.enum(value, 'status', ['active', 'archived'] as const)).toBe('active')
    expect(payload.stringArray(value, 'tags')).toEqual(['one', 'two'])
    expect(payload.objectArray(value, 'children')).toEqual([{ id: 'child-1' }])
  })

  it('supports nullable and fallback reads without inventing values', () => {
    const value = payload.object({ note: '', rank: null })

    expect(payload.nextNullableString(value, 'missing', 'fallback')).toBe('fallback')
    expect(payload.nextNullableString(value, 'note', 'fallback')).toBe('')
    expect(payload.nullableInteger(value, 'rank', { minimum: 0 })).toBeNull()
  })

  it('raises a domain error with the configured code', () => {
    expect(() => payload.string(payload.object({ name: '   ' }), 'name')).toThrow(DomainCommandError)
    try {
      payload.integer(payload.object({ count: 0 }), 'count', { minimum: 1 })
    }
    catch (error: unknown) {
      expect(error).toBeInstanceOf(DomainCommandError)
      expect((error as DomainCommandError).code).toBe('INVALID_TEST_PAYLOAD')
      expect((error as Error).message).toContain('count')
    }
  })
})
