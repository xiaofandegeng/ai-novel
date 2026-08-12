import type { CommandEnvelope, JsonObject } from '../../eventing'
import { and, eq } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { db, sql } from '../../db'
import { conflictParticipants, conflicts, conflictTimelineEvents } from '../../db/schema'
import {
  AggregateRepository,
  CommandBus,
  EventRegistry,
  EventStore,
  ProjectionRegistry,
  ProjectionReplay,
} from '../../eventing'
import { resetTestDatabase } from '../../test/database'
import {
  CHARACTER_AGGREGATE_TYPE,
  CREATE_CHARACTER_COMMAND,
  registerCharacterEventing,
} from '../character/character.eventing'
import { CREATE_PROJECT_COMMAND, registerProjectEventing } from '../project/project.eventing'
import { CREATE_CHAPTER_COMMAND, registerChapterEventing } from '../story/chapter.eventing'
import {
  CHANGE_CONFLICT_COMMAND,
  CONFLICT_AGGREGATE_TYPE,
  CONFLICT_PROJECTION,
  CREATE_CONFLICT_COMMAND,
  DELETE_CONFLICT_COMMAND,
  RECORD_CONFLICT_TIMELINE_COMMAND,
  registerConflictEventing,
  REMOVE_CONFLICT_TIMELINE_COMMAND,
  REPLACE_CONFLICT_PARTICIPANTS_COMMAND,
} from './conflict.eventing'

afterAll(() => sql.end())

describe('conflict eventing', () => {
  const runtime = createRuntime()
  beforeEach(resetTestDatabase)

  it('changes conflict state and atomically replaces validated participants', async () => {
    await seed(runtime.commands)
    await expect(runtime.commands.dispatch(conflictCommand(CREATE_CONFLICT_COMMAND, {
      title: '旧航线之争',
      type: 'external',
      intensity: 40,
      status: 'forming',
    }))).resolves.toMatchObject({ title: '旧航线之争', intensity: 40 })
    await expect(runtime.commands.dispatch(conflictCommand(CHANGE_CONFLICT_COMMAND, {
      intensity: 75,
      status: 'escalating',
    }, 'command-change'))).resolves.toMatchObject({ intensity: 75, status: 'escalating' })
    await runtime.commands.dispatch(conflictCommand(REPLACE_CONFLICT_PARTICIPANTS_COMMAND, {
      participants: [
        { id: 'participant-1', characterId: 'character-1', roleInConflict: '追问者' },
        { id: 'participant-2', characterId: 'character-2', roleInConflict: '隐瞒者' },
      ],
    }, 'command-participants'))
    await expect(readParticipants('project-1', 'conflict-1')).resolves.toHaveLength(2)
    await expect(runtime.commands.dispatch(conflictCommand(REPLACE_CONFLICT_PARTICIPANTS_COMMAND, {
      participants: [{ id: 'participant-x', characterId: 'missing' }],
    }, 'command-invalid-participants'))).rejects.toMatchObject({ code: 'CHARACTER_NOT_FOUND' })
    await expect(readParticipants('project-1', 'conflict-1')).resolves.toHaveLength(2)
  })

  it('records and removes timeline events after chapter and scene ownership validation', async () => {
    await seed(runtime.commands)
    await runtime.commands.dispatch(conflictCommand(CREATE_CONFLICT_COMMAND, {
      title: '旧航线之争',
      type: 'external',
    }))
    const result = await runtime.commands.dispatch(conflictCommand(RECORD_CONFLICT_TIMELINE_COMMAND, {
      id: 'timeline-1',
      chapterId: 'chapter-1',
      intensityBefore: 20,
      intensityAfter: 70,
      statusBefore: 'forming',
      statusAfter: 'escalating',
      sourceType: 'manual',
    }, 'command-timeline'))
    expect(result).toMatchObject({ id: 'timeline-1', intensityAfter: 70 })
    await expect(runtime.commands.dispatch(conflictCommand(RECORD_CONFLICT_TIMELINE_COMMAND, {
      id: 'timeline-invalid',
      chapterId: 'missing',
    }, 'command-invalid-timeline'))).rejects.toMatchObject({ code: 'CHAPTER_NOT_FOUND' })
    await runtime.commands.dispatch(conflictCommand(
      REMOVE_CONFLICT_TIMELINE_COMMAND,
      { id: 'timeline-1' },
      'command-remove-timeline',
    ))
    await expect(readTimeline('project-1', 'timeline-1')).resolves.toBeUndefined()
  })

  it('deletes idempotently and replays a project with child rows', async () => {
    await seed(runtime.commands)
    await runtime.commands.dispatch(conflictCommand(CREATE_CONFLICT_COMMAND, {
      title: '第一冲突',
      type: 'internal',
    }))
    const firstDelete = await runtime.commands.dispatch(conflictCommand(
      DELETE_CONFLICT_COMMAND,
      {},
      'command-delete',
    ))
    await expect(runtime.commands.dispatch(conflictCommand(
      DELETE_CONFLICT_COMMAND,
      {},
      'command-delete',
    ))).resolves.toEqual(firstDelete)

    await runtime.commands.dispatch(conflictCommand(CREATE_CONFLICT_COMMAND, {
      title: '第二冲突',
      type: 'external',
    }, 'command-create-2', 'conflict-2'))
    await runtime.commands.dispatch(conflictCommand(REPLACE_CONFLICT_PARTICIPANTS_COMMAND, {
      participants: [{ id: 'participant-2', characterId: 'character-1' }],
    }, 'command-participant-2', 'conflict-2'))
    await runtime.commands.dispatch(conflictCommand(RECORD_CONFLICT_TIMELINE_COMMAND, {
      id: 'timeline-2',
      chapterId: 'chapter-1',
    }, 'command-timeline-2', 'conflict-2'))
    const expected = await readConflict('project-1', 'conflict-2')

    await new ProjectionReplay(runtime.projections, runtime.store)
      .replayProjection(CONFLICT_PROJECTION, { projectId: 'project-1' })

    await expect(readConflict('project-1', 'conflict-2')).resolves.toEqual(expected)
    await expect(readParticipants('project-1', 'conflict-2')).resolves.toHaveLength(1)
    await expect(readTimeline('project-1', 'timeline-2')).resolves.toBeDefined()
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
  registerConflictEventing({ aggregates, commands, events, projections })
  return { commands, projections, store }
}

async function seed(commands: CommandBus) {
  await commands.dispatch({
    commandId: 'command-project',
    commandType: CREATE_PROJECT_COMMAND,
    aggregateType: 'Project',
    aggregateId: 'project-1',
    projectId: 'project-1',
    correlationId: 'command-project',
    payload: { title: '项目' },
  })
  for (const [id, name] of [['character-1', '林岚'], ['character-2', '周砚']]) {
    await commands.dispatch({
      commandId: `command-${id}`,
      commandType: CREATE_CHARACTER_COMMAND,
      aggregateType: CHARACTER_AGGREGATE_TYPE,
      aggregateId: id,
      projectId: 'project-1',
      correlationId: `command-${id}`,
      payload: { name },
    })
  }
  await commands.dispatch({
    commandId: 'command-chapter',
    commandType: CREATE_CHAPTER_COMMAND,
    aggregateType: 'Chapter',
    aggregateId: 'chapter-1',
    projectId: 'project-1',
    correlationId: 'command-chapter',
    payload: { title: '归港', chapterNumber: 1 },
  })
}

function conflictCommand(
  commandType: string,
  payload: JsonObject,
  commandId = 'command-conflict',
  conflictId = 'conflict-1',
): CommandEnvelope {
  return {
    commandId,
    commandType,
    aggregateType: CONFLICT_AGGREGATE_TYPE,
    aggregateId: conflictId,
    projectId: 'project-1',
    correlationId: commandId,
    payload,
  }
}

async function readConflict(projectId: string, id: string) {
  const [row] = await db.select().from(conflicts).where(and(eq(conflicts.projectId, projectId), eq(conflicts.id, id))).limit(1)
  return row
}

function readParticipants(projectId: string, conflictId: string) {
  return db.select().from(conflictParticipants).where(and(
    eq(conflictParticipants.projectId, projectId),
    eq(conflictParticipants.conflictId, conflictId),
  ))
}

async function readTimeline(projectId: string, id: string) {
  const [row] = await db.select().from(conflictTimelineEvents).where(and(
    eq(conflictTimelineEvents.projectId, projectId),
    eq(conflictTimelineEvents.id, id),
  )).limit(1)
  return row
}
