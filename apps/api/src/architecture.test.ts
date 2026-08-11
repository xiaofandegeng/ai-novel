import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const sourceRoot = fileURLToPath(new URL('.', import.meta.url))

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory())
      return sourceFiles(path)
    return entry.name.endsWith('.ts') ? [path] : []
  })
}

describe('api architecture boundaries', () => {
  it('does not restore the legacy flat route, service, or utility directories', () => {
    for (const directory of ['routes', 'services', 'utils'])
      expect(existsSync(join(sourceRoot, directory)), directory).toBe(false)
  })

  it('keeps every route registrar in a named route module and the composition root', () => {
    const moduleRoot = join(sourceRoot, 'modules')
    const files = sourceFiles(moduleRoot)
    const routeFiles = files.filter(file => /export function register\w+Routes/.test(readFileSync(file, 'utf8')))
    const compositionRoot = readFileSync(join(moduleRoot, 'index.ts'), 'utf8')

    expect(routeFiles.length).toBeGreaterThan(0)
    for (const file of routeFiles) {
      const source = readFileSync(file, 'utf8')
      const registrar = source.match(/export function (register\w+Routes)/)?.[1]
      expect(file, relative(sourceRoot, file)).toMatch(/\.routes\.ts$/)
      expect(registrar, relative(sourceRoot, file)).toBeTruthy()
      expect(compositionRoot, registrar).toContain(registrar)
    }
  })

  it('keeps database access out of HTTP route modules', () => {
    const routeFiles = sourceFiles(join(sourceRoot, 'modules'))
      .filter(file => file.endsWith('.routes.ts'))

    for (const file of routeFiles) {
      const source = readFileSync(file, 'utf8')
      expect(source, relative(sourceRoot, file)).not.toMatch(/from ['"].*\/db(?:\/schema)?['"]/)
    }
  })

  it('keeps configuration and shared primitives independent from domain modules', () => {
    const configSources = sourceFiles(join(sourceRoot, 'config'))
      .filter(file => !file.endsWith('.test.ts'))
      .map(file => readFileSync(file, 'utf8'))
      .join('\n')
    const sharedSources = sourceFiles(join(sourceRoot, 'shared'))
      .filter(file => !file.endsWith('.test.ts'))
      .map(file => readFileSync(file, 'utf8'))
      .join('\n')

    expect(configSources).not.toMatch(/from ['"].*modules\//)
    expect(sharedSources).not.toMatch(/from ['"].*modules\//)
  })

  it('keeps HTTP envelopes out of the general utility barrel', () => {
    const utilityBarrel = readFileSync(join(sourceRoot, 'shared/utils/index.ts'), 'utf8')
    expect(utilityBarrel).not.toMatch(/\b(?:fail|success)\b/)
  })
})
