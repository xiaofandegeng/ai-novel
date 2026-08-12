import { afterEach, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

it('loads the structural encryption scanner without a project content master key', async () => {
  vi.stubEnv('PROJECT_CONTENT_MASTER_KEY', '')
  vi.resetModules()

  const scanner = await import('./verify-content-encryption')

  expect(scanner.verifyContentEncryption).toBeTypeOf('function')
})
