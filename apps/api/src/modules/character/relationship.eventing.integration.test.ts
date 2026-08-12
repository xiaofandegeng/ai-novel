import type { CommandEnvelope, JsonObject } from '../../eventing'
import { and, eq } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { db, sql } from '../../db'
import { characterRelationships } from '../../db/schema'
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
import {
  CHARACTER_AGGREGATE_TYPE,
  CREATE_CHARACTER_COMMAND,
  registerCharacterEventing,
} from './character.eventing'
import {
  CHANGE_RELATIONSHIP_COMMAND,
  CREATE_RELATIONSHIP_COMMAND,
  DELETE_RELATIONSHIP_COMMAND,
  registerRelationshipEventing,
  RELATIONSHIP_AGGREGATE_TYPE,
  RELATIONSHIP_PROJECTION,
} from './relationship.eventing'

afterAll(() => sql.end())

describe('relationship eventing', () => {
  const runtime = createRuntime()

  beforeEach(resetTestDatabase)

  it('normalizes a pair, rejects duplicates, and changes the relationship', async () => {
    await seedCharacters(runtime.commands, 'project-1')

    await expect(runtime.commands.dispatch(relationshipCommand(CREATE_RELATIONSHIP_COMMAND, {
      characterAId: 'character-2',
      characterBId: 'character-1',
      type: '盟友',
      strength: 70,
    }))).resolves.toMatchObject({
      characterAId: 'character-1',
      characterBId: 'character-2',
      strength: 70,
    })
    await expect(runtime.commands.dispatch(relationshipCommand(
      CREATE_RELATIONSHIP_COMMAND,
      {
        characterAId: 'character-1',
        characterBId: 'character-2',
        type: '对手',
      },
      'command-duplicate',
      'project-1',
      'relationship-2',
    ))).rejects.toMatchObject({ code: 'RELATIONSHIP_ALREADY_EXISTS' })
    await expect(runtime.commands.dispatch(relationshipCommand(
      CHANGE_RELATIONSHIP_COMMAND,
      { strength: 85, status: 'active' },
      'command-change',
    ))).resolves.toMatchObject({ type: '盟友', strength: 85, status: 'active' })
  })

  it('rejects self-links and characters outside the project', async () => {
    await seedCharacters(runtime.commands, 'project-1')
    await createProject(runtime.commands, 'project-2')
    await createCharacter(runtime.commands, 'project-2', 'character-3', '外部角色')

    await expect(runtime.commands.dispatch(relationshipCommand(CREATE_RELATIONSHIP_COMMAND, {
      characterAId: 'character-1',
      characterBId: 'character-1',
      type: '自我',
    }, 'command-self'))).rejects.toMatchObject({ code: 'INVALID_RELATIONSHIP_CHARACTERS' })
    await expect(runtime.commands.dispatch(relationshipCommand(CREATE_RELATIONSHIP_COMMAND, {
      characterAId: 'character-1',
      characterBId: 'character-3',
      type: '跨项目',
    }, 'command-cross-project'))).rejects.toMatchObject({ code: 'CHARACTER_NOT_FOUND' })
  })

  it('deletes idempotently and replays one project in isolation', async () => {
    await seedCharacters(runtime.commands, 'project-1')
    await runtime.commands.dispatch(relationshipCommand(CREATE_RELATIONSHIP_COMMAND, {
      characterAId: 'character-1',
      characterBId: 'character-2',
      type: '盟友',
    }))
    const first = await runtime.commands.dispatch(relationshipCommand(
      DELETE_RELATIONSHIP_COMMAND,
      {},
      'command-delete',
    ))
    const retried = await runtime.commands.dispatch(relationshipCommand(
      DELETE_RELATIONSHIP_COMMAND,
      {},
      'command-delete',
    ))
    expect(retried).toEqual(first)

    await runtime.commands.dispatch(relationshipCommand(
      CREATE_RELATIONSHIP_COMMAND,
      {
        characterAId: 'character-1',
        characterBId: 'character-2',
        type: '重建关系',
      },
      'command-recreate',
      'project-1',
      'relationship-2',
    ))
    const expected = await readRelationship('project-1', 'relationship-2')
    await db.delete(characterRelationships).where(eq(characterRelationships.projectId, 'project-1'))

    await new ProjectionReplay(runtime.projections, runtime.store)
      .replayProjection(RELATIONSHIP_PROJECTION, { projectId: 'project-1' })

    await expect(readRelationship('project-1', 'relationship-2')).resolves.toEqual(expected)
  })
})

function createRuntime() {
  const store = new EventStore()
  const events = new EventRegistry()
  const projections = new ProjectionRegistry(events)
  const commands = new CommandBus(store, projections, events)
  const aggregates = new AggregateRepository(store, events)
  registerProjectEventing({ aggregates, commands, events, projections })
  registerCharacterEventing({ aggregates, commands, events, projections })
  registerRelationshipEventing({ aggregates, commands, events, projections })
  return { commands, projections, store }
}

async function seedCharacters(commands: CommandBus, projectId: string): Promise<void> {
  await createProject(commands, projectId)
  await createCharacter(commands, projectId, 'character-1', '林岚')
  await createCharacter(commands, projectId, 'character-2', '周砚')
}

async function createProject(commands: CommandBus, projectId: string): Promise<void> {
  await commands.dispatch({
    commandId: `command-project-${projectId}`,
    commandType: CREATE_PROJECT_COMMAND,
    aggregateType: 'Project',
    aggregateId: projectId,
    projectId,
    correlationId: `command-project-${projectId}`,
    payload: { title: projectId },
  })
}

async function createCharacter(
  commands: CommandBus,
  projectId: string,
  characterId: string,
  name: string,
): Promise<void> {
  await commands.dispatch({
    commandId: `command-${projectId}-${characterId}`,
    commandType: CREATE_CHARACTER_COMMAND,
    aggregateType: CHARACTER_AGGREGATE_TYPE,
    aggregateId: characterId,
    projectId,
    correlationId: `command-${projectId}-${characterId}`,
    payload: { name },
  })
}

function relationshipCommand(
  commandType: string,
  payload: JsonObject,
  commandId = 'command-relationship',
  projectId = 'project-1',
  relationshipId = 'relationship-1',
): CommandEnvelope {
  return {
    commandId,
    commandType,
    aggregateType: RELATIONSHIP_AGGREGATE_TYPE,
    aggregateId: relationshipId,
    projectId,
    correlationId: commandId,
    payload,
  }
}

async function readRelationship(projectId: string, id: string) {
  const [row] = await db.select().from(characterRelationships).where(and(
    eq(characterRelationships.projectId, projectId),
    eq(characterRelationships.id, id),
  )).limit(1)
  return row
}
