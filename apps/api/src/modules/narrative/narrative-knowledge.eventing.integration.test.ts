import type { CommandEnvelope, JsonObject } from '../../eventing'
import { eq } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { db, sql } from '../../db'
import { authoringEvents, knowledgeChunks, knowledgeNotes, knowledgeSources, storyFactTriples } from '../../db/schema'
import { AggregateRepository, CommandBus, EventRegistry, EventStore, ProjectionRegistry, ProjectionReplay } from '../../eventing'
import { resetTestDatabase } from '../../test/database'
import { CREATE_PROJECT_COMMAND, registerProjectEventing } from '../project/project.eventing'
import { CREATE_CHAPTER_COMMAND, registerChapterEventing } from '../story/chapter.eventing'
import {
  ADD_KNOWLEDGE_CHUNK_COMMAND,
  ADD_KNOWLEDGE_NOTE_COMMAND,
  ADD_KNOWLEDGE_SOURCE_COMMAND,
  CHANGE_STORY_FACT_COMMAND,
  NARRATIVE_KNOWLEDGE_AGGREGATE_TYPE,
  NARRATIVE_KNOWLEDGE_PROJECTION,
  RECORD_AUTHORING_EVENT_COMMAND,
  RECORD_STORY_FACT_COMMAND,
  registerNarrativeKnowledgeEventing,
  REMOVE_KNOWLEDGE_SOURCE_COMMAND,
  REMOVE_STORY_FACT_COMMAND,
} from './narrative-knowledge.eventing'

afterAll(() => sql.end())

describe('narrative knowledge eventing', () => {
  const runtime = createRuntime()
  beforeEach(resetTestDatabase)

  it('records, changes, and removes project facts with chapter ownership validation', async () => {
    await seed(runtime.commands)
    await expect(runtime.commands.dispatch(command(RECORD_STORY_FACT_COMMAND, {
      id: 'fact-1',
      subjectType: 'character',
      subjectName: '林岚',
      predicate: '抵达',
      objectType: 'location',
      objectName: '雾港',
      confidence: 90,
      sourceType: 'manual',
      sourceChapterId: 'chapter-1',
      status: 'confirmed',
    }))).resolves.toMatchObject({ id: 'fact-1', status: 'confirmed' })
    await expect(runtime.commands.dispatch(command(CHANGE_STORY_FACT_COMMAND, {
      id: 'fact-1',
      confidence: 95,
      notes: '作者确认',
    }, 'command-fact-change'))).resolves.toMatchObject({ confidence: 95 })
    await expect(runtime.commands.dispatch(command(RECORD_STORY_FACT_COMMAND, {
      id: 'fact-invalid',
      subjectType: 'event',
      subjectName: '归港',
      predicate: '发生于',
      objectType: 'chapter',
      objectName: '缺失',
      sourceChapterId: 'missing',
    }, 'command-fact-invalid'))).rejects.toMatchObject({ code: 'CHAPTER_NOT_FOUND' })
    await runtime.commands.dispatch(command(REMOVE_STORY_FACT_COMMAND, { id: 'fact-1' }, 'command-fact-remove'))
    await expect(db.select().from(storyFactTriples).where(eq(storyFactTriples.projectId, 'project-1'))).resolves.toHaveLength(0)
  })

  it('owns knowledge sources, chunks, and notes inside one project stream', async () => {
    await seed(runtime.commands)
    await runtime.commands.dispatch(command(ADD_KNOWLEDGE_SOURCE_COMMAND, {
      id: 'source-1',
      title: '参考小说',
      sourceType: 'reference',
      status: 'completed',
    }))
    await runtime.commands.dispatch(command(ADD_KNOWLEDGE_CHUNK_COMMAND, {
      id: 'chunk-1',
      sourceId: 'source-1',
      chunkType: 'technique',
      content: '用环境推动悬念',
      orderIndex: 1,
    }, 'command-chunk'))
    await runtime.commands.dispatch(command(ADD_KNOWLEDGE_NOTE_COMMAND, {
      id: 'note-1',
      sourceId: 'source-1',
      title: '节奏',
      content: '压缩解释段落',
    }, 'command-note'))
    await expect(db.select().from(knowledgeChunks).where(eq(knowledgeChunks.projectId, 'project-1'))).resolves.toHaveLength(1)
    await expect(db.select().from(knowledgeNotes).where(eq(knowledgeNotes.projectId, 'project-1'))).resolves.toHaveLength(1)
    await runtime.commands.dispatch(command(REMOVE_KNOWLEDGE_SOURCE_COMMAND, { id: 'source-1' }, 'command-source-remove'))
    await expect(db.select().from(knowledgeSources).where(eq(knowledgeSources.projectId, 'project-1'))).resolves.toHaveLength(0)
    await expect(db.select().from(knowledgeChunks).where(eq(knowledgeChunks.projectId, 'project-1'))).resolves.toHaveLength(0)
  })

  it('records authoring activity and replays all narrative knowledge rows', async () => {
    await seed(runtime.commands)
    await runtime.commands.dispatch(command(ADD_KNOWLEDGE_SOURCE_COMMAND, {
      id: 'source-1',
      title: '参考小说',
      sourceType: 'reference',
    }))
    await runtime.commands.dispatch(command(RECORD_STORY_FACT_COMMAND, {
      id: 'fact-1',
      subjectType: 'character',
      subjectName: '林岚',
      predicate: '抵达',
      objectType: 'location',
      objectName: '雾港',
      sourceChapterId: 'chapter-1',
    }, 'command-fact'))
    await runtime.commands.dispatch(command(RECORD_AUTHORING_EVENT_COMMAND, {
      id: 'authoring-1',
      chapterId: 'chapter-1',
      eventType: 'draft_write',
      source: 'manual',
      payload: { reason: '强化冲突' },
    }, 'command-authoring'))

    await new ProjectionReplay(runtime.projections, runtime.store)
      .replayProjection(NARRATIVE_KNOWLEDGE_PROJECTION, { projectId: 'project-1' })

    await expect(db.select().from(knowledgeSources).where(eq(knowledgeSources.projectId, 'project-1'))).resolves.toHaveLength(1)
    await expect(db.select().from(storyFactTriples).where(eq(storyFactTriples.projectId, 'project-1'))).resolves.toHaveLength(1)
    await expect(db.select().from(authoringEvents).where(eq(authoringEvents.projectId, 'project-1'))).resolves.toHaveLength(1)
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
  registerNarrativeKnowledgeEventing({ aggregates, commands, events, projections })
  return { commands, projections, store }
}

async function seed(commands: CommandBus) {
  await commands.dispatch({ commandId: 'project', commandType: CREATE_PROJECT_COMMAND, aggregateType: 'Project', aggregateId: 'project-1', projectId: 'project-1', correlationId: 'project', payload: { title: '项目' } })
  await commands.dispatch({ commandId: 'chapter', commandType: CREATE_CHAPTER_COMMAND, aggregateType: 'Chapter', aggregateId: 'chapter-1', projectId: 'project-1', correlationId: 'chapter', payload: { title: '归港', chapterNumber: 1 } })
}

function command(commandType: string, payload: JsonObject, commandId = 'command-knowledge'): CommandEnvelope {
  return { commandId, commandType, aggregateType: NARRATIVE_KNOWLEDGE_AGGREGATE_TYPE, aggregateId: 'project-1', projectId: 'project-1', correlationId: commandId, payload }
}
