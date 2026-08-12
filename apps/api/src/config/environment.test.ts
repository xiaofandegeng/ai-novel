import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  getAIEnvironmentConfig,
  getCredentialMasterKey,
  getDatabaseUrl,
  getProjectContentMasterKey,
  getServerConfig,
} from './environment'

describe('runtime environment config', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('reads explicit database and server settings', () => {
    vi.stubEnv('DATABASE_URL', 'postgres://localhost:5432/custom')
    vi.stubEnv('PORT', '4100')
    vi.stubEnv('CORS_ORIGINS', 'https://writer.example.com, https://preview.example.com')

    expect(getDatabaseUrl()).toBe('postgres://localhost:5432/custom')
    expect(getServerConfig()).toEqual({
      port: 4100,
      corsOrigins: ['https://writer.example.com', 'https://preview.example.com'],
    })
  })

  it('falls back for invalid server values and parses AI defaults', () => {
    vi.stubEnv('PORT', 'invalid')
    vi.stubEnv('CORS_ORIGINS', '')
    vi.stubEnv('AI_PROVIDER', 'openai-compatible')
    vi.stubEnv('AI_TEMPERATURE', '65')

    expect(getServerConfig()).toEqual({
      port: 3000,
      corsOrigins: ['http://localhost:5173'],
    })
    expect(getAIEnvironmentConfig()).toMatchObject({
      provider: 'openai-compatible',
      temperature: 65,
    })
  })

  it('preserves legacy numeric environment semantics', () => {
    vi.stubEnv('PORT', '-1.5')
    vi.stubEnv('AI_TEMPERATURE', 'invalid')

    expect(getServerConfig().port).toBe(-1.5)
    expect(getAIEnvironmentConfig().temperature).toBeNaN()
  })

  it('exposes the credential master key only to the security boundary', () => {
    vi.stubEnv('AI_CREDENTIAL_MASTER_KEY', 'base64-key')

    expect(getCredentialMasterKey()).toBe('base64-key')
  })

  it('decodes the project content master key independently from the credential key', () => {
    const projectContentMasterKey = Buffer.alloc(32, 9).toString('base64')
    vi.stubEnv('AI_CREDENTIAL_MASTER_KEY', 'credential-key')
    vi.stubEnv('PROJECT_CONTENT_MASTER_KEY', projectContentMasterKey)

    expect(getCredentialMasterKey()).toBe('credential-key')
    expect(getProjectContentMasterKey()).toEqual(Buffer.alloc(32, 9))
  })
})
