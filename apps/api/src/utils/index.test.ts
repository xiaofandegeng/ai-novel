import { afterEach, describe, expect, it, vi } from 'vitest'
import { errorMessage, fail, generateId, now, success, timestampMs, updatedFields } from './index'

describe('api response and mutation helpers', () => {
  afterEach(() => vi.useRealTimers())

  it('creates UUID identifiers', () => {
    expect(generateId()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
  })

  it('returns stable success and failure envelopes', () => {
    expect(success({ id: 'p1' })).toEqual({ success: true, data: { id: 'p1' } })
    expect(success('saved', 'Project saved')).toEqual({ success: true, data: 'saved', message: 'Project saved' })
    expect(fail('Project not found')).toEqual({ success: false, error: 'Project not found' })
  })

  it('normalizes unknown errors without unsafe property access', () => {
    expect(errorMessage(new Error('database unavailable'))).toBe('database unavailable')
    expect(errorMessage('bad value', 'fallback')).toBe('fallback')
  })

  it('keeps explicit nulls while dropping undefined update fields', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-11T06:30:00.000Z'))

    expect(updatedFields({ title: '新标题', description: null, genre: undefined })).toEqual({
      title: '新标题',
      description: null,
      updatedAt: '2026-08-11T06:30:00.000Z',
    })
    expect(now()).toBe('2026-08-11T06:30:00.000Z')
  })

  it('interprets database timestamps without an offset as UTC', () => {
    expect(timestampMs('2026-08-11 06:30:00.000')).toBe(Date.parse('2026-08-11T06:30:00.000Z'))
    expect(timestampMs('2026-08-11T14:30:00.000+08:00')).toBe(Date.parse('2026-08-11T06:30:00.000Z'))
  })
})
