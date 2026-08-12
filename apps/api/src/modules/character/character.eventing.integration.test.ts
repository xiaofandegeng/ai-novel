import type { CommandEnvelope, JsonObject } from '../../eventing'
import { and, eq } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { db, sql } from '../../db'
import { characterArcEvents, characterRelationships, characters } from '../../db/schema'
import {
  AggregateRepository,
  CommandBus,
  EventRegistry,
  EventStore,
  ProjectionRegistry,
  ProjectionReplay,
} from '../../eventing'
import { resetTestDatabase } from '../../test/database'
import { CREATE_PROJECT_COMMAND, registerProjectEventing } from '../project/project.eventing'
import { CREATE_CHAPTER_COMMAND, registerChapterEventing } from '../story/chapter.eventing'
import {
  CHANGE_CHARACTER_COMMAND,
  CHARACTER_AGGREGATE_TYPE,
  CHARACTER_PROJECTION,
  CORRECT_CHARACTER_ARC_EVENT_COMMAND,
  CREATE_CHARACTER_COMMAND,
  DELETE_CHARACTER_COMMAND,
  RECORD_CHARACTER_ARC_EVENT_COMMAND,
  registerCharacterEventing,
  REMOVE_CHARACTER_ARC_EVENT_COMMAND,
} from './character.eventing'
import {
  CREATE_RELATIONSHIP_COMMAND,
  registerRelationshipEventing,
  RELATIONSHIP_AGGREGATE_TYPE,
} from './relationship.eventing'

afterAll(() => sql.end())

describe('character eventing', () => {
  const runtime = createRuntime()

  beforeEach(resetTestDatabase)

  it('creates, changes, and idempotently deletes a character', async () => {
    await createProject(runtime.commands, 'project-1')

    await expect(runtime.commands.dispatch(characterCommand(CREATE_CHARACTER_COMMAND, {
      name: '林岚',
      role: '调查员',
      goal: '找到船队',
    }))).resolves.toMatchObject({ id: 'character-1', name: '林岚', role: '调查员' })
    await expect(runtime.commands.dispatch(characterCommand(CHANGE_CHARACTER_COMMAND, {
      fear: '深海',
    }, 'command-change'))).resolves.toMatchObject({ name: '林岚', fear: '深海' })

    const firstDelete = await runtime.commands.dispatch(characterCommand(
      DELETE_CHARACTER_COMMAND,
      {},
      'command-delete',
    ))
    const retriedDelete = await runtime.commands.dispatch(characterCommand(
      DELETE_CHARACTER_COMMAND,
      {},
      'command-delete',
    ))
    expect(retriedDelete).toEqual(firstDelete)
    await expect(readCharacter('project-1', 'character-1')).resolves.toBeUndefined()
    expect((await runtime.store.loadStream(characterStream())).map(event => event.eventType)).toEqual([
      'CharacterCreated',
      'CharacterChanged',
      'CharacterDeleted',
    ])
  })

  it('records, corrects, and removes arc events after validating chapter ownership', async () => {
    await createProject(runtime.commands, 'project-1')
    await runtime.commands.dispatch(characterCommand(CREATE_CHARACTER_COMMAND, { name: '林岚' }))
    await runtime.commands.dispatch(chapterCommand(CREATE_CHAPTER_COMMAND, {
      chapterNumber: 1,
      title: '归港',
    }))

    await expect(runtime.commands.dispatch(characterCommand(RECORD_CHARACTER_ARC_EVENT_COMMAND, {
      id: 'arc-1',
      chapterId: 'chapter-1',
      eventType: 'goal_shift',
      beforeState: '寻找船队',
      afterState: '保护幸存者',
      sourceType: 'manual',
    }, 'command-arc'))).resolves.toMatchObject({ id: 'arc-1', eventType: 'goal_shift' })
    await expect(runtime.commands.dispatch(characterCommand(CORRECT_CHARACTER_ARC_EVENT_COMMAND, {
      id: 'arc-1',
      eventType: 'belief_changed',
    }, 'command-correct-arc'))).resolves.toMatchObject({ id: 'arc-1', eventType: 'belief_changed' })
    await expect(runtime.commands.dispatch(characterCommand(RECORD_CHARACTER_ARC_EVENT_COMMAND, {
      id: 'arc-other-project',
      chapterId: 'missing-chapter',
      eventType: 'loss',
    }, 'command-invalid-arc'))).rejects.toMatchObject({ code: 'CHAPTER_NOT_FOUND' })

    await runtime.commands.dispatch(characterCommand(
      REMOVE_CHARACTER_ARC_EVENT_COMMAND,
      { id: 'arc-1' },
      'command-remove-arc',
    ))
    await expect(readArc('project-1', 'arc-1')).resolves.toBeUndefined()
  })

  it('replays one project without changing another project', async () => {
    await createProject(runtime.commands, 'project-1')
    await createProject(runtime.commands, 'project-2')
    await runtime.commands.dispatch(characterCommand(CREATE_CHARACTER_COMMAND, { name: '林岚' }))
    await runtime.commands.dispatch(characterCommand(
      CREATE_CHARACTER_COMMAND,
      { name: '周砚' },
      'command-project-2',
      'project-2',
      'character-2',
    ))
    const projectTwoBefore = await readCharacter('project-2', 'character-2')
    await db.delete(characters).where(eq(characters.projectId, 'project-1'))

    await new ProjectionReplay(runtime.projections, runtime.store)
      .replayProjection(CHARACTER_PROJECTION, { projectId: 'project-1' })

    await expect(readCharacter('project-1', 'character-1')).resolves.toMatchObject({ name: '林岚' })
    await expect(readCharacter('project-2', 'character-2')).resolves.toEqual(projectTwoBefore)
  })

  it('replays characters without mutating the relationship projection', async () => {
    await createProject(runtime.commands, 'project-1')
    await runtime.commands.dispatch(characterCommand(CREATE_CHARACTER_COMMAND, { name: '林岚' }))
    await runtime.commands.dispatch(characterCommand(
      CREATE_CHARACTER_COMMAND,
      { name: '周砚' },
      'command-character-2',
      'project-1',
      'character-2',
    ))
    await runtime.commands.dispatch({
      commandId: 'command-relationship',
      commandType: CREATE_RELATIONSHIP_COMMAND,
      aggregateType: RELATIONSHIP_AGGREGATE_TYPE,
      aggregateId: 'relationship-1',
      projectId: 'project-1',
      correlationId: 'command-relationship',
      payload: {
        characterAId: 'character-1',
        characterBId: 'character-2',
        type: '盟友',
      },
    })
    const relationshipBefore = await readRelationship('project-1', 'relationship-1')

    await new ProjectionReplay(runtime.projections, runtime.store)
      .replayProjection(CHARACTER_PROJECTION, { projectId: 'project-1' })

    await expect(readRelationship('project-1', 'relationship-1')).resolves.toEqual(relationshipBefore)
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
  registerRelationshipEventing({ aggregates, commands, events, projections })
  return { commands, projections, store }
}

async function createProject(commands: CommandBus, projectId: string): Promise<void> {
  await commands.dispatch({
    commandId: `command-create-${projectId}`,
    commandType: CREATE_PROJECT_COMMAND,
    aggregateType: 'Project',
    aggregateId: projectId,
    projectId,
    correlationId: `command-create-${projectId}`,
    payload: { title: `项目 ${projectId}` },
  })
}

function characterCommand(
  commandType: string,
  payload: JsonObject,
  commandId = 'command-character',
  projectId = 'project-1',
  characterId = 'character-1',
): CommandEnvelope {
  return {
    commandId,
    commandType,
    aggregateType: CHARACTER_AGGREGATE_TYPE,
    aggregateId: characterId,
    projectId,
    correlationId: commandId,
    payload,
  }
}

function chapterCommand(commandType: string, payload: JsonObject): CommandEnvelope {
  return {
    commandId: 'command-chapter',
    commandType,
    aggregateType: 'Chapter',
    aggregateId: 'chapter-1',
    projectId: 'project-1',
    correlationId: 'command-chapter',
    payload,
  }
}

function characterStream() {
  return {
    aggregateType: CHARACTER_AGGREGATE_TYPE,
    aggregateId: 'character-1',
    projectId: 'project-1',
  }
}

async function readCharacter(projectId: string, id: string) {
  const [row] = await db.select().from(characters).where(and(
    eq(characters.projectId, projectId),
    eq(characters.id, id),
  )).limit(1)
  return row
}

async function readArc(projectId: string, id: string) {
  const [row] = await db.select().from(characterArcEvents).where(and(
    eq(characterArcEvents.projectId, projectId),
    eq(characterArcEvents.id, id),
  )).limit(1)
  return row
}

async function readRelationship(projectId: string, id: string) {
  const [row] = await db.select().from(characterRelationships).where(and(
    eq(characterRelationships.projectId, projectId),
    eq(characterRelationships.id, id),
  )).limit(1)
  return row
}
