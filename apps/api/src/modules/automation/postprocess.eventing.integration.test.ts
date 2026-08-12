import type { CommandEnvelope, JsonObject } from '../../eventing'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { db, sql } from '../../db'
import { chapterPostprocessRuns, chapterPostprocessSuggestions, chapterStyleFingerprints } from '../../db/schema'
import { AggregateRepository, CommandBus, EventRegistry, EventStore, ProjectionRegistry, ProjectionReplay } from '../../eventing'
import { resetTestDatabase } from '../../test/database'
import { CREATE_PROJECT_COMMAND, registerProjectEventing } from '../project/project.eventing'
import { CREATE_CHAPTER_COMMAND, registerChapterEventing } from '../story/chapter.eventing'
import {
  CHANGE_POSTPROCESS_RUN_COMMAND,
  CHANGE_POSTPROCESS_SUGGESTION_COMMAND,
  GENERATE_POSTPROCESS_SUGGESTION_COMMAND,
  POSTPROCESS_PROJECTION,
  POSTPROCESS_RUN_AGGREGATE_TYPE,
  POSTPROCESS_SUGGESTION_AGGREGATE_TYPE,
  RECORD_STYLE_FINGERPRINT_COMMAND,
  registerPostprocessEventing,
  REQUEST_POSTPROCESS_RUN_COMMAND,
  STYLE_FINGERPRINT_AGGREGATE_TYPE,
} from './postprocess.eventing'

afterAll(() => sql.end())

describe('postprocess eventing', () => {
  const runtime = createRuntime()
  beforeEach(resetTestDatabase)

  it('tracks a postprocess run and suggestion lifecycle', async () => {
    await seed(runtime.commands)
    await runtime.commands.dispatch(runCommand(REQUEST_POSTPROCESS_RUN_COMMAND, { chapterId: 'chapter-1', trigger: 'auto_drive' }))
    await runtime.commands.dispatch(suggestionCommand(GENERATE_POSTPROCESS_SUGGESTION_COMMAND, { chapterId: 'chapter-1', runId: 'run-1', suggestionType: 'fact_triple', payload: '{"subject":"甲"}', confidence: 90 }))
    await runtime.commands.dispatch(suggestionCommand(CHANGE_POSTPROCESS_SUGGESTION_COMMAND, { status: 'accepted' }, 'accept'))
    await runtime.commands.dispatch(suggestionCommand(CHANGE_POSTPROCESS_SUGGESTION_COMMAND, { status: 'applying' }, 'claim'))
    await runtime.commands.dispatch(suggestionCommand(CHANGE_POSTPROCESS_SUGGESTION_COMMAND, { status: 'applied' }, 'apply'))
    await runtime.commands.dispatch(runCommand(CHANGE_POSTPROCESS_RUN_COMMAND, { status: 'completed', finishedAt: '2026-08-12T00:00:00.000Z' }, 'complete'))

    await expect(db.select().from(chapterPostprocessRuns)).resolves.toMatchObject([{ status: 'completed' }])
    await expect(db.select().from(chapterPostprocessSuggestions)).resolves.toMatchObject([{ status: 'applied' }])
  })

  it('rejects illegal suggestion transitions and foreign run references', async () => {
    await seed(runtime.commands)
    await expect(runtime.commands.dispatch(suggestionCommand(GENERATE_POSTPROCESS_SUGGESTION_COMMAND, { chapterId: 'chapter-1', runId: 'missing', suggestionType: 'fact_triple', payload: '{}', confidence: 70 }))).rejects.toMatchObject({ code: 'POSTPROCESS_RUN_NOT_FOUND' })
    await runtime.commands.dispatch(suggestionCommand(GENERATE_POSTPROCESS_SUGGESTION_COMMAND, { chapterId: 'chapter-1', runId: null, suggestionType: 'fact_triple', payload: '{}', confidence: 70 }, 'generate-orphan'))
    await expect(runtime.commands.dispatch(suggestionCommand(CHANGE_POSTPROCESS_SUGGESTION_COMMAND, { status: 'applied' }, 'apply-pending'))).rejects.toMatchObject({ code: 'INVALID_POSTPROCESS_SUGGESTION_TRANSITION' })
  })

  it('upserts deterministic style fingerprints and replays all projections', async () => {
    await seed(runtime.commands)
    const payload = { chapterId: 'chapter-1', sceneId: null, scope: 'chapter', sentenceLengthAvg: 12, dialogueRatio: 20, emotionDensity: 30, conflictDensity: 40, hookDensity: 10, styleSummary: '简洁' }
    await runtime.commands.dispatch(fingerprintCommand(RECORD_STYLE_FINGERPRINT_COMMAND, payload))
    await runtime.commands.dispatch(fingerprintCommand(RECORD_STYLE_FINGERPRINT_COMMAND, { ...payload, styleSummary: '紧凑' }, 'update-style'))
    await new ProjectionReplay(runtime.projections, runtime.store).replayProjection(POSTPROCESS_PROJECTION, { projectId: 'project-1' })
    await expect(db.select().from(chapterStyleFingerprints)).resolves.toMatchObject([{ id: 'style-1', styleSummary: '紧凑' }])
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
  registerPostprocessEventing({ aggregates, commands, events, projections })
  return { commands, projections, store }
}

async function seed(commands: CommandBus) {
  await commands.dispatch({ commandId: 'project', commandType: CREATE_PROJECT_COMMAND, aggregateType: 'Project', aggregateId: 'project-1', projectId: 'project-1', correlationId: 'project', payload: { title: '项目' } })
  await commands.dispatch({ commandId: 'chapter', commandType: CREATE_CHAPTER_COMMAND, aggregateType: 'Chapter', aggregateId: 'chapter-1', projectId: 'project-1', correlationId: 'chapter', payload: { title: '归港', chapterNumber: 1 } })
}

function runCommand(commandType: string, payload: JsonObject, commandId = 'run'): CommandEnvelope {
  return { commandId, commandType, aggregateType: POSTPROCESS_RUN_AGGREGATE_TYPE, aggregateId: 'run-1', projectId: 'project-1', correlationId: commandId, payload }
}

function suggestionCommand(commandType: string, payload: JsonObject, commandId = 'suggestion'): CommandEnvelope {
  return { commandId, commandType, aggregateType: POSTPROCESS_SUGGESTION_AGGREGATE_TYPE, aggregateId: 'suggestion-1', projectId: 'project-1', correlationId: commandId, payload }
}

function fingerprintCommand(commandType: string, payload: JsonObject, commandId = 'fingerprint'): CommandEnvelope {
  return { commandId, commandType, aggregateType: STYLE_FINGERPRINT_AGGREGATE_TYPE, aggregateId: 'style-1', projectId: 'project-1', correlationId: commandId, payload }
}
