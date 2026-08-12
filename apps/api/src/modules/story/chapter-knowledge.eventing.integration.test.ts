import type { CommandEnvelope, JsonObject } from '../../eventing'
import { and, eq } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { db, sql } from '../../db'
import { chapterElements, chapterMemories } from '../../db/schema'
import { AggregateRepository, CommandBus, EventRegistry, EventStore, ProjectionRegistry, ProjectionReplay } from '../../eventing'
import { resetTestDatabase } from '../../test/database'
import { CHARACTER_AGGREGATE_TYPE, CREATE_CHARACTER_COMMAND, registerCharacterEventing } from '../character/character.eventing'
import { CREATE_PROJECT_COMMAND, registerProjectEventing } from '../project/project.eventing'
import {
  ADD_CHAPTER_ELEMENT_COMMAND,
  CHANGE_CHAPTER_ELEMENT_COMMAND,
  CHAPTER_KNOWLEDGE_AGGREGATE_TYPE,
  CHAPTER_KNOWLEDGE_PROJECTION,
  RECORD_CHAPTER_MEMORY_COMMAND,
  registerChapterKnowledgeEventing,
  REMOVE_CHAPTER_ELEMENT_COMMAND,
  REPLACE_CHAPTER_ELEMENTS_COMMAND,
} from './chapter-knowledge.eventing'
import { CREATE_CHAPTER_COMMAND, registerChapterEventing } from './chapter.eventing'

afterAll(() => sql.end())

describe('chapter knowledge eventing', () => {
  const runtime = createRuntime()
  beforeEach(resetTestDatabase)

  it('normalizes character elements and supports element CRUD', async () => {
    await seed(runtime.commands)
    await expect(runtime.commands.dispatch(command(ADD_CHAPTER_ELEMENT_COMMAND, {
      id: 'element-1',
      elementType: 'character',
      elementId: 'character-1',
      elementName: '错误名称',
      relationType: 'appears',
      importance: 'major',
    }))).resolves.toMatchObject({ id: 'element-1', elementName: '林岚' })
    await expect(runtime.commands.dispatch(command(CHANGE_CHAPTER_ELEMENT_COMMAND, {
      id: 'element-1',
      notes: '在码头登场',
    }, 'command-change'))).resolves.toMatchObject({ notes: '在码头登场' })
    await runtime.commands.dispatch(command(REMOVE_CHAPTER_ELEMENT_COMMAND, { id: 'element-1' }, 'command-remove'))
    await expect(readElement('project-1', 'element-1')).resolves.toBeUndefined()
  })

  it('replaces elements atomically and rejects deterministic duplicates', async () => {
    await seed(runtime.commands)
    await expect(runtime.commands.dispatch(command(REPLACE_CHAPTER_ELEMENTS_COMMAND, {
      elements: [
        { id: 'element-1', elementType: 'location', elementName: '旧灯塔', relationType: 'appears' },
        { id: 'element-2', elementType: 'item', elementName: '罗盘', relationType: 'uses' },
      ],
    }))).resolves.toMatchObject({ elements: expect.arrayContaining([expect.objectContaining({ id: 'element-1' })]) })
    await expect(runtime.commands.dispatch(command(REPLACE_CHAPTER_ELEMENTS_COMMAND, {
      elements: [
        { id: 'dup-1', elementType: 'location', elementName: '旧灯塔', relationType: 'appears' },
        { id: 'dup-2', elementType: 'location', elementName: '旧灯塔', relationType: 'appears' },
      ],
    }, 'command-duplicate'))).rejects.toMatchObject({ code: 'CHAPTER_ELEMENT_DUPLICATE' })
    await expect(readElements('project-1', 'chapter-1')).resolves.toHaveLength(2)
  })

  it('records one stable chapter memory and replays the complete projection', async () => {
    await seed(runtime.commands)
    await runtime.commands.dispatch(command(ADD_CHAPTER_ELEMENT_COMMAND, {
      id: 'element-1',
      elementType: 'event',
      elementName: '归港',
      relationType: 'occurs',
    }))
    await expect(runtime.commands.dispatch(command(RECORD_CHAPTER_MEMORY_COMMAND, {
      id: 'memory-1',
      summary: '调查员回到雾港',
      keyEvents: '["归港"]',
    }, 'command-memory'))).resolves.toMatchObject({ id: 'memory-1', summary: '调查员回到雾港' })
    await expect(runtime.commands.dispatch(command(RECORD_CHAPTER_MEMORY_COMMAND, {
      id: 'ignored-new-id',
      summary: '调查员发现码头无人',
    }, 'command-memory-update'))).resolves.toMatchObject({ id: 'memory-1', summary: '调查员发现码头无人' })

    await new ProjectionReplay(runtime.projections, runtime.store)
      .replayProjection(CHAPTER_KNOWLEDGE_PROJECTION, { projectId: 'project-1' })

    await expect(readElements('project-1', 'chapter-1')).resolves.toHaveLength(1)
    await expect(readMemory('project-1', 'chapter-1')).resolves.toMatchObject({ id: 'memory-1', summary: '调查员发现码头无人' })
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
  registerCharacterEventing({ aggregates, commands, events, projections })
  registerChapterKnowledgeEventing({ aggregates, commands, events, projections })
  return { commands, projections, store }
}

async function seed(commands: CommandBus) {
  await commands.dispatch({ commandId: 'project', commandType: CREATE_PROJECT_COMMAND, aggregateType: 'Project', aggregateId: 'project-1', projectId: 'project-1', correlationId: 'project', payload: { title: '项目' } })
  await commands.dispatch({ commandId: 'chapter', commandType: CREATE_CHAPTER_COMMAND, aggregateType: 'Chapter', aggregateId: 'chapter-1', projectId: 'project-1', correlationId: 'chapter', payload: { title: '归港', chapterNumber: 1 } })
  await commands.dispatch({ commandId: 'character', commandType: CREATE_CHARACTER_COMMAND, aggregateType: CHARACTER_AGGREGATE_TYPE, aggregateId: 'character-1', projectId: 'project-1', correlationId: 'character', payload: { name: '林岚' } })
}

function command(commandType: string, payload: JsonObject, commandId = 'command-knowledge'): CommandEnvelope {
  return { commandId, commandType, aggregateType: CHAPTER_KNOWLEDGE_AGGREGATE_TYPE, aggregateId: 'chapter-1', projectId: 'project-1', correlationId: commandId, payload }
}

async function readElement(projectId: string, id: string) {
  const [row] = await db.select().from(chapterElements).where(and(eq(chapterElements.projectId, projectId), eq(chapterElements.id, id))).limit(1)
  return row
}

function readElements(projectId: string, chapterId: string) {
  return db.select().from(chapterElements).where(and(eq(chapterElements.projectId, projectId), eq(chapterElements.chapterId, chapterId)))
}

async function readMemory(projectId: string, chapterId: string) {
  const [row] = await db.select().from(chapterMemories).where(and(eq(chapterMemories.projectId, projectId), eq(chapterMemories.chapterId, chapterId))).limit(1)
  return row
}
