import process from 'node:process'
import { afterEach, describe, expect, it } from 'vitest'
import { fakeAIEmbedding, fakeAIJSON, isFakeAIEnabled } from './ai-fake-provider'

const originalMode = process.env.AI_FAKE_MODE
const originalNodeEnv = process.env.NODE_ENV

afterEach(() => {
  process.env.AI_FAKE_MODE = originalMode
  process.env.NODE_ENV = originalNodeEnv
})

describe('deterministic fake AI provider', () => {
  it('requires an explicit non-production flag', () => {
    process.env.AI_FAKE_MODE = 'true'
    process.env.NODE_ENV = 'test'
    expect(isFakeAIEnabled()).toBe(true)

    process.env.NODE_ENV = 'production'
    expect(isFakeAIEnabled()).toBe(false)
  })

  it('returns stable workflow payloads and rejects unknown tasks', () => {
    expect(fakeAIJSON('generate_plan')).toMatchObject({ title: '雾港来信' })
    expect(fakeAIJSON('consistency_guard')).toMatchObject({ overallStatus: 'pass', score: 100 })
    expect(fakeAIEmbedding()).toHaveLength(1536)
    expect(fakeAIEmbedding().slice(0, 4)).toEqual([0.25, 0.5, 0.75, 1])
    expect(() => fakeAIJSON('unknown')).toThrow('Unsupported fake AI task type')
  })
})
