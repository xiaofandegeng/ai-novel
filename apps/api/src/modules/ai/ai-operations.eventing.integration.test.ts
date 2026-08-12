import type { CommandEnvelope, JsonObject } from '../../eventing'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { db, sql } from '../../db'
import { aiContextSnapshots, aiGenerationCandidates, aiUsageRecords, knowledgeEmbeddings, projectHealthReports, promptTemplateRuns, qualityReports } from '../../db/schema'
import { AggregateRepository, CommandBus, EventRegistry, EventStore, ProjectionRegistry, ProjectionReplay } from '../../eventing'
import { resetTestDatabase } from '../../test/database'
import { CREATE_PROJECT_COMMAND, registerProjectEventing } from '../project/project.eventing'
import { CREATE_CHAPTER_COMMAND, registerChapterEventing } from '../story/chapter.eventing'
import {
  AI_OPERATION_AGGREGATE_TYPE,
  AI_OPERATIONS_PROJECTION,
  CHANGE_AI_OPERATION_COMMAND,
  RECORD_AI_OPERATION_COMMAND,
  registerAIOperationsEventing,
} from './ai-operations.eventing'

afterAll(() => sql.end())

describe('aI operations eventing', () => {
  const runtime = createRuntime()
  beforeEach(resetTestDatabase)

  it('records immutable operational facts and changes a candidate', async () => {
    await seed(runtime.commands)
    await runtime.commands.dispatch(command('context-1', RECORD_AI_OPERATION_COMMAND, 'context_snapshot', { chapterId: 'chapter-1', requestId: 'request-1', contextPayload: '{}', renderedPromptPreview: 'prompt', tokenEstimate: 10 }))
    await runtime.commands.dispatch(command('usage-1', RECORD_AI_OPERATION_COMMAND, 'usage', { chapterId: 'chapter-1', contextSnapshotId: 'context-1', provider: 'openai', model: 'gpt', taskType: 'draft', promptTokens: 1, completionTokens: 2, totalTokens: 3, latencyMs: 4, status: 'success' }))
    await runtime.commands.dispatch(command('prompt-run-1', RECORD_AI_OPERATION_COMMAND, 'prompt_run', { templateId: 'template-1', templateVersion: '1', contextSnapshotId: 'context-1' }))
    await runtime.commands.dispatch(command('health-1', RECORD_AI_OPERATION_COMMAND, 'health_report', { scope: 'overall', score: 90, riskLevel: 'low', metricsJson: {} }))
    await runtime.commands.dispatch(command('quality-1', RECORD_AI_OPERATION_COMMAND, 'quality_report', { chapterId: 'chapter-1', scope: 'chapter', score: 88 }))
    await runtime.commands.dispatch(command('candidate-1', RECORD_AI_OPERATION_COMMAND, 'candidate', { chapterId: 'chapter-1', contextSnapshotId: 'context-1', provider: 'openai', model: 'gpt', taskType: 'draft', content: '候选' }))
    await runtime.commands.dispatch(command('candidate-1', CHANGE_AI_OPERATION_COMMAND, 'candidate', { userSelected: 1, userRating: 5 }, 'select'))

    await expect(db.select().from(aiContextSnapshots)).resolves.toHaveLength(1)
    await expect(db.select().from(aiUsageRecords)).resolves.toHaveLength(1)
    await expect(db.select().from(promptTemplateRuns)).resolves.toHaveLength(1)
    await expect(db.select().from(projectHealthReports)).resolves.toHaveLength(1)
    await expect(db.select().from(qualityReports)).resolves.toHaveLength(1)
    await expect(db.select().from(aiGenerationCandidates)).resolves.toMatchObject([{ userSelected: 1, userRating: 5 }])
  })

  it('upserts an embedding and rejects a foreign chapter', async () => {
    await seed(runtime.commands)
    await runtime.commands.dispatch(command('embedding-1', RECORD_AI_OPERATION_COMMAND, 'embedding', { sourceId: null, chunkId: null, embeddingModel: 'small', embeddingVector: vector(0.1), contentType: 'fact_summary', contentHash: 'hash' }))
    await runtime.commands.dispatch(command('embedding-1', CHANGE_AI_OPERATION_COMMAND, 'embedding', { sourceId: 'source-1', embeddingVector: vector(0.3) }, 'update-embedding'))
    await expect(db.select().from(knowledgeEmbeddings)).resolves.toMatchObject([{ sourceId: 'source-1' }])
    await expect(runtime.commands.dispatch(command('candidate-2', RECORD_AI_OPERATION_COMMAND, 'candidate', { chapterId: 'missing', provider: 'openai', model: 'gpt', taskType: 'draft', content: '候选' }, 'foreign'))).rejects.toMatchObject({ code: 'CHAPTER_NOT_FOUND' })
  })

  it('replays all AI operation projections', async () => {
    await seed(runtime.commands)
    await runtime.commands.dispatch(command('candidate-1', RECORD_AI_OPERATION_COMMAND, 'candidate', { chapterId: 'chapter-1', provider: 'openai', model: 'gpt', taskType: 'draft', content: '候选' }))
    await runtime.commands.dispatch(command('health-1', RECORD_AI_OPERATION_COMMAND, 'health_report', { scope: 'overall', score: 80, riskLevel: 'medium', metricsJson: {} }))
    await new ProjectionReplay(runtime.projections, runtime.store).replayProjection(AI_OPERATIONS_PROJECTION, { projectId: 'project-1' })
    await expect(db.select().from(aiGenerationCandidates)).resolves.toHaveLength(1)
    await expect(db.select().from(projectHealthReports)).resolves.toHaveLength(1)
  })
})

function createRuntime() {
  const store = new EventStore()
  const events = new EventRegistry()
  const projections = new ProjectionRegistry(events)
  const commands = new CommandBus(store, projections, events)
  const aggregates = new AggregateRepository(store, events)
  registerProjectEventing({ aggregates, commands, events, projections })
  registerChapterEventing({ aggregates, commands, events, projections })
  registerAIOperationsEventing({ aggregates, commands, events, projections })
  return { commands, projections, store }
}

async function seed(commands: CommandBus) {
  await commands.dispatch({ commandId: 'project', commandType: CREATE_PROJECT_COMMAND, aggregateType: 'Project', aggregateId: 'project-1', projectId: 'project-1', correlationId: 'project', payload: { title: '项目' } })
  await commands.dispatch({ commandId: 'chapter', commandType: CREATE_CHAPTER_COMMAND, aggregateType: 'Chapter', aggregateId: 'chapter-1', projectId: 'project-1', correlationId: 'chapter', payload: { title: '归港', chapterNumber: 1 } })
}

function command(aggregateId: string, commandType: string, kind: string, data: JsonObject, commandId = aggregateId): CommandEnvelope {
  return { commandId, commandType, aggregateType: AI_OPERATION_AGGREGATE_TYPE, aggregateId, projectId: 'project-1', correlationId: commandId, payload: { kind, data } }
}

function vector(value: number): number[] {
  return Array.from({ length: 1536 }, () => value)
}
