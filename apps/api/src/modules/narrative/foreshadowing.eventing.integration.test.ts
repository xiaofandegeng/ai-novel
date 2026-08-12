import type { CommandEnvelope, JsonObject } from '../../eventing'
import { and, eq } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { db, sql } from '../../db'
import { foreshadowingCharacters, foreshadowingItems } from '../../db/schema'
import { AggregateRepository, CommandBus, EventRegistry, EventStore, ProjectionRegistry, ProjectionReplay } from '../../eventing'
import { resetTestDatabase } from '../../test/database'
import { CHARACTER_AGGREGATE_TYPE, CREATE_CHARACTER_COMMAND, registerCharacterEventing } from '../character/character.eventing'
import { CREATE_PROJECT_COMMAND, registerProjectEventing } from '../project/project.eventing'
import { CREATE_CHAPTER_COMMAND, registerChapterEventing } from '../story/chapter.eventing'
import {
  CHANGE_FORESHADOWING_COMMAND,
  CREATE_FORESHADOWING_COMMAND,
  DELETE_FORESHADOWING_COMMAND,
  FORESHADOWING_AGGREGATE_TYPE,
  FORESHADOWING_PROJECTION,
  registerForeshadowingEventing,
  REPLACE_FORESHADOWING_CHARACTERS_COMMAND,
} from './foreshadowing.eventing'

afterAll(() => sql.end())

describe('foreshadowing eventing', () => {
  const runtime = createRuntime()
  beforeEach(resetTestDatabase)

  it('creates, progresses, and atomically replaces character links', async () => {
    await seed(runtime.commands)
    await expect(runtime.commands.dispatch(command(CREATE_FORESHADOWING_COMMAND, {
      title: '生锈的罗盘',
      setupChapterId: 'chapter-1',
      status: 'open',
      importance: 'major',
      characterIds: ['character-1'],
    }))).resolves.toMatchObject({ title: '生锈的罗盘', status: 'open' })
    await expect(runtime.commands.dispatch(command(CHANGE_FORESHADOWING_COMMAND, {
      status: 'paid_off',
      payoffChapterId: 'chapter-1',
    }, 'command-progress'))).resolves.toMatchObject({ status: 'paid_off' })
    await runtime.commands.dispatch(command(REPLACE_FORESHADOWING_CHARACTERS_COMMAND, {
      characters: [{ id: 'link-1', characterId: 'character-1', relationType: 'witness' }],
    }, 'command-links'))
    await expect(readLinks('project-1', 'foreshadowing-1')).resolves.toHaveLength(1)
    await expect(runtime.commands.dispatch(command(REPLACE_FORESHADOWING_CHARACTERS_COMMAND, {
      characters: [{ id: 'link-x', characterId: 'missing', relationType: 'related' }],
    }, 'command-invalid-links'))).rejects.toMatchObject({ code: 'CHARACTER_NOT_FOUND' })
    await expect(readLinks('project-1', 'foreshadowing-1')).resolves.toHaveLength(1)
  })

  it('validates chapter ownership and replays child rows', async () => {
    await seed(runtime.commands)
    await expect(runtime.commands.dispatch(command(CREATE_FORESHADOWING_COMMAND, {
      title: '错误章节',
      setupChapterId: 'missing',
    }))).rejects.toMatchObject({ code: 'CHAPTER_NOT_FOUND' })
    await runtime.commands.dispatch(command(CREATE_FORESHADOWING_COMMAND, {
      title: '生锈的罗盘',
      setupChapterId: 'chapter-1',
    }, 'command-create-valid'))
    await runtime.commands.dispatch(command(REPLACE_FORESHADOWING_CHARACTERS_COMMAND, {
      characters: [{ id: 'link-1', characterId: 'character-1', relationType: 'witness' }],
    }, 'command-links'))
    const expected = await readItem('project-1', 'foreshadowing-1')
    await new ProjectionReplay(runtime.projections, runtime.store)
      .replayProjection(FORESHADOWING_PROJECTION, { projectId: 'project-1' })
    await expect(readItem('project-1', 'foreshadowing-1')).resolves.toEqual(expected)
    await expect(readLinks('project-1', 'foreshadowing-1')).resolves.toHaveLength(1)
  })

  it('deletes idempotently', async () => {
    await seed(runtime.commands)
    await runtime.commands.dispatch(command(CREATE_FORESHADOWING_COMMAND, { title: '待删除' }))
    const first = await runtime.commands.dispatch(command(DELETE_FORESHADOWING_COMMAND, {}, 'command-delete'))
    await expect(runtime.commands.dispatch(command(DELETE_FORESHADOWING_COMMAND, {}, 'command-delete'))).resolves.toEqual(first)
    await expect(readItem('project-1', 'foreshadowing-1')).resolves.toBeUndefined()
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
  registerForeshadowingEventing({ aggregates, commands, events, projections })
  return { commands, projections, store }
}

async function seed(commands: CommandBus) {
  await commands.dispatch({ commandId: 'project', commandType: CREATE_PROJECT_COMMAND, aggregateType: 'Project', aggregateId: 'project-1', projectId: 'project-1', correlationId: 'project', payload: { title: '项目' } })
  await commands.dispatch({ commandId: 'character', commandType: CREATE_CHARACTER_COMMAND, aggregateType: CHARACTER_AGGREGATE_TYPE, aggregateId: 'character-1', projectId: 'project-1', correlationId: 'character', payload: { name: '林岚' } })
  await commands.dispatch({ commandId: 'chapter', commandType: CREATE_CHAPTER_COMMAND, aggregateType: 'Chapter', aggregateId: 'chapter-1', projectId: 'project-1', correlationId: 'chapter', payload: { title: '归港', chapterNumber: 1 } })
}

function command(commandType: string, payload: JsonObject, commandId = 'command-foreshadowing'): CommandEnvelope {
  return { commandId, commandType, aggregateType: FORESHADOWING_AGGREGATE_TYPE, aggregateId: 'foreshadowing-1', projectId: 'project-1', correlationId: commandId, payload }
}

async function readItem(projectId: string, id: string) {
  const [row] = await db.select().from(foreshadowingItems).where(and(eq(foreshadowingItems.projectId, projectId), eq(foreshadowingItems.id, id))).limit(1)
  return row
}

function readLinks(projectId: string, foreshadowingId: string) {
  return db.select().from(foreshadowingCharacters).where(and(eq(foreshadowingCharacters.projectId, projectId), eq(foreshadowingCharacters.foreshadowingId, foreshadowingId)))
}
