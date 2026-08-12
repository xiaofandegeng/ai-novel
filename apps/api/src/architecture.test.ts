import type { EventDefinition, EventPayloadProtection, JsonObject } from './eventing'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { describe, expect, expectTypeOf, it } from 'vitest'
import { domainEventRegistry } from './eventing-runtime'
import { EVENT_PAYLOAD_PROTECTION_CATALOG } from './eventing/event-protection-catalog'

const sourceRoot = fileURLToPath(new URL('.', import.meta.url))

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory())
      return sourceFiles(path)
    return entry.name.endsWith('.ts') ? [path] : []
  })
}

function eventRegistrationsWithoutPayloadProtection(file: string): string[] {
  const source = readFileSync(file, 'utf8')
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true)
  const missing: string[] = []

  function visit(node: ts.Node): void {
    if (
      ts.isCallExpression(node)
      && ts.isPropertyAccessExpression(node.expression)
      && node.expression.name.text === 'register'
      && node.arguments.length > 0
      && ts.isObjectLiteralExpression(node.arguments[0])
    ) {
      const definition = node.arguments[0]
      const propertyNames = new Set(definition.properties.map(property => property.name?.getText(sourceFile)))
      if (
        propertyNames.has('eventType')
        && propertyNames.has('currentSchemaVersion')
        && !propertyNames.has('payloadProtection')
      ) {
        const { line } = sourceFile.getLineAndCharacterOfPosition(definition.getStart(sourceFile))
        missing.push(`${relative(sourceRoot, file)}:${line + 1}`)
      }
    }
    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  return missing
}

function compareEventTypeSets(
  expectedEventTypes: Iterable<string>,
  actualEventTypes: Iterable<string>,
): { missing: string[], unexpected: string[] } {
  const expected = new Set(expectedEventTypes)
  const actual = new Set(actualEventTypes)
  return {
    missing: [...expected].filter(eventType => !actual.has(eventType)).sort(),
    unexpected: [...actual].filter(eventType => !expected.has(eventType)).sort(),
  }
}

describe('api architecture boundaries', () => {
  it('reports registered domain event types missing from the reviewed classification', () => {
    expect(compareEventTypeSets(
      ['ExpectedProjectEvent'],
      ['UnexpectedLifecycleEvent', 'ExpectedProjectEvent'],
    )).toEqual({
      missing: [],
      unexpected: ['UnexpectedLifecycleEvent'],
    })
  })

  it('requires every domain event registration to declare payload protection', () => {
    const missing = sourceFiles(join(sourceRoot, 'modules'))
      .filter(file => file.endsWith('.eventing.ts'))
      .flatMap(eventRegistrationsWithoutPayloadProtection)

    expect(missing).toEqual([])
    expectTypeOf<EventDefinition<JsonObject>['payloadProtection']>()
      .toEqualTypeOf<EventPayloadProtection>()
  })

  it('classifies every registered domain event by its payload sensitivity', () => {
    const expected = new Map<string, EventPayloadProtection>(
      Object.entries(EVENT_PAYLOAD_PROTECTION_CATALOG),
    )

    expect(expected.size).toBe(86)
    const differences = compareEventTypeSets(expected.keys(), domainEventRegistry.eventTypes())
    expect(
      differences,
      `Domain event classification registry mismatch: ${JSON.stringify(differences)}`,
    ).toEqual({ missing: [], unexpected: [] })
    for (const [eventType, payloadProtection] of expected) {
      expect(domainEventRegistry.has(eventType), eventType).toBe(true)
      expect(domainEventRegistry.protectionFor(eventType), eventType).toBe(payloadProtection)
    }
  })

  it('starts autonomous writing only through the durable outbox', () => {
    const source = readFileSync(join(sourceRoot, 'modules/automation/autonomous-writing.service.ts'), 'utf8')
    expect(source).not.toMatch(/runNextAutonomousStep\(projectId, runId\)\.catch/)
    const writingSource = readFileSync(join(sourceRoot, 'modules/automation/writing-job.service.ts'), 'utf8')
    const publicStart = writingSource.slice(writingSource.indexOf('export async function startJob'), writingSource.indexOf('export async function executeWritingJob'))
    expect(publicStart).not.toContain('runNextSteps(')
  })

  it('keeps process managers command-only and free of direct projection writes', () => {
    const processManagers = sourceFiles(join(sourceRoot, 'modules'))
      .filter(file => file.endsWith('.process-manager.ts'))

    expect(processManagers.length).toBeGreaterThan(0)
    for (const file of processManagers) {
      const source = readFileSync(file, 'utf8')
      expect(source, relative(sourceRoot, file)).not.toMatch(/\bdb\.(?:insert|update|delete)\(/)
      expect(source, relative(sourceRoot, file)).not.toMatch(/transaction\.(?:insert|update|delete)\(/)
    }
  })

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

  it('keeps eventing infrastructure independent from domain modules', () => {
    const eventingSources = sourceFiles(join(sourceRoot, 'eventing'))
      .filter(file => !file.endsWith('.test.ts'))
      .map(file => readFileSync(file, 'utf8'))
      .join('\n')

    expect(eventingSources).not.toMatch(/from ['"].*modules\//)
  })

  it('restricts eventing table access to eventing infrastructure and schema declarations', () => {
    const nonEventingSources = sourceFiles(sourceRoot)
      .filter(file => !file.endsWith('.test.ts'))
      .filter(file => !file.includes('/eventing/'))
      .filter(file => !file.includes('/db/schema/'))
      .map(file => readFileSync(file, 'utf8'))
      .join('\n')

    expect(nonEventingSources).not.toMatch(
      /\b(?:domainEvents|aggregateStreams|aggregateSnapshots|eventOutbox|commandReceipts|projectionCheckpoints)\b/,
    )
  })

  it('routes every production domain event insert through EventStore appendBatch', () => {
    const eventStorePath = join(sourceRoot, 'eventing/event-store.ts')
    const directWriters = sourceFiles(sourceRoot)
      .filter(file => !file.endsWith('.test.ts'))
      .filter(file => !file.includes('/db/schema/'))
      .filter(file => file !== eventStorePath)
      .filter((file) => {
        const source = readFileSync(file, 'utf8')
        return /\.insert\(domainEvents\)/.test(source)
          || /insert\s+into\s+["']?domain_events\b/i.test(source)
      })
      .map(file => relative(sourceRoot, file))

    expect(directWriters).toEqual([])
    const eventStoreSource = readFileSync(eventStorePath, 'utf8')
    expect(eventStoreSource.match(/\.insert\(domainEvents\)/g)).toHaveLength(1)
    expect(eventStoreSource).not.toMatch(/insert\s+into\s+["']?domain_events\b/i)
  })

  it('restricts event-sourced projection writes to projectors', () => {
    const projectionTables = [
      'novelProjects',
      'projectReadModels',
      'projectAISettings',
      'projectPromptOverrides',
      'storyBibles',
      'volumes',
      'acts',
      'projectAppliedTemplates',
      'chapters',
      'chapterScenes',
      'chapterVersions',
      'characters',
      'characterArcEvents',
      'characterRelationships',
      'conflicts',
      'conflictParticipants',
      'conflictTimelineEvents',
      'foreshadowingItems',
      'foreshadowingCharacters',
      'chapterElements',
      'chapterMemories',
      'storyFactTriples',
      'knowledgeSources',
      'knowledgeChunks',
      'knowledgeNotes',
      'authoringEvents',
      'writingJobs',
      'writingJobSteps',
      'autonomousWritingRuns',
      'autonomousRunJobs',
      'autonomousRunExceptions',
      'chapterChangeSets',
      'chapterChangeSetItems',
      'chapterPostprocessRuns',
      'chapterPostprocessSuggestions',
      'chapterStyleFingerprints',
      'aiGenerationCandidates',
      'aiContextSnapshots',
      'aiUsageRecords',
      'promptTemplateRuns',
      'projectHealthReports',
      'knowledgeEmbeddings',
      'qualityReports',
    ]
    const applicationFiles = sourceFiles(sourceRoot)
      .filter(file => !file.endsWith('.test.ts'))
      .filter(file => !file.includes('/db/schema/'))
      .filter(file => !file.endsWith('.eventing.ts'))

    for (const file of applicationFiles) {
      const source = readFileSync(file, 'utf8')
      for (const table of projectionTables) {
        expect(source, `${relative(sourceRoot, file)} writes ${table}`)
          .not
          .toMatch(new RegExp(`\\.(?:insert|update|delete)\\(${table}\\)`))
      }
    }
  })

  it('keeps HTTP envelopes out of the general utility barrel', () => {
    const utilityBarrel = readFileSync(join(sourceRoot, 'shared/utils/index.ts'), 'utf8')
    expect(utilityBarrel).not.toMatch(/\b(?:fail|success)\b/)
  })

  it('does not restore unreachable legacy product experiments', () => {
    const forbiddenSchemaFiles = ['persona.ts', 'writing-goals.ts']
    for (const file of forbiddenSchemaFiles)
      expect(existsSync(join(sourceRoot, 'db/schema', file)), file).toBe(false)

    const applicationSources = sourceFiles(sourceRoot)
      .filter(file => !file.endsWith('.test.ts'))
      .map(file => readFileSync(file, 'utf8'))
      .join('\n')

    expect(applicationSources).not.toMatch(
      /\b(?:aiSettings|aiQualityFeedback|referenceTrainingSets|writingPersonas|writingGoals|dailyWritingStats)\b/,
    )
  })

  it('does not restore automation steps that bypass approved change sets', () => {
    const applicationSources = sourceFiles(sourceRoot)
      .filter(file => !file.endsWith('.test.ts'))
      .map(file => readFileSync(file, 'utf8'))
      .join('\n')

    expect(applicationSources).not.toMatch(/['"](?:apply_draft|save_version|consistency_check)['"]/)
    expect(applicationSources).not.toMatch(/function execute(?:ApplyDraft|ApplySceneDraft|SaveVersion|ConsistencyCheck)/)
  })
})
