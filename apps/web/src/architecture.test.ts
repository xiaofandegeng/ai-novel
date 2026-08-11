import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, extname, join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const sourceRoot = resolve(process.cwd(), 'src')

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory())
      return sourceFiles(path)
    return ['.ts', '.vue'].includes(extname(entry.name)) ? [path] : []
  })
}

function resolveSourceImport(importer: string, specifier: string, files: Set<string>) {
  const base = specifier.startsWith('@/')
    ? join(sourceRoot, specifier.slice(2))
    : specifier.startsWith('.')
      ? resolve(dirname(importer), specifier)
      : null

  if (!base)
    return null

  return [base, `${base}.ts`, `${base}.vue`, join(base, 'index.ts')]
    .find(candidate => files.has(candidate)) ?? null
}

describe('web architecture boundaries', () => {
  it('does not restore legacy cross-domain source buckets', () => {
    for (const directory of ['api', 'composables', 'stores', 'utils'])
      expect(existsSync(join(sourceRoot, directory)), directory).toBe(false)
  })

  it('keeps shared code independent from feature modules', () => {
    const sharedSource = sourceFiles(join(sourceRoot, 'shared'))
      .filter(file => !file.endsWith('.test.ts'))
      .map(file => readFileSync(file, 'utf8'))
      .join('\n')
    expect(sharedSource).not.toMatch(/from ['"].*features\//)
  })

  it('keeps every production source reachable from the application entry', () => {
    const productionFiles = sourceFiles(sourceRoot)
      .filter(file => !file.endsWith('.test.ts') && !file.endsWith('.d.ts'))
    const files = new Set(productionFiles)
    const visited = new Set<string>()
    const pending = [join(sourceRoot, 'main.ts')]

    while (pending.length) {
      const file = pending.pop()!
      if (visited.has(file) || !files.has(file))
        continue

      visited.add(file)
      const source = readFileSync(file, 'utf8')
      for (const match of source.matchAll(/(?:from|import\s*\()\s*['"]([^'"]+)['"]/g)) {
        const dependency = resolveSourceImport(file, match[1], files)
        if (dependency)
          pending.push(dependency)
      }
    }

    const unreachable = productionFiles
      .filter(file => !visited.has(file))
      .map(file => relative(sourceRoot, file))
    expect(unreachable).toEqual([])
  })
})
