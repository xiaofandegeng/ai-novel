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
