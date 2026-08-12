import type { CommandEnvelope, JsonObject } from '../../eventing'
import { eq } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { db, sql } from '../../db'
import { novelProjects, projectReadModels } from '../../db/schema'
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
  CREATE_PROJECT_COMMAND,
  DELETE_PROJECT_COMMAND,
  PROJECT_PROJECTION,
  registerProjectEventing,
  UPDATE_PROJECT_COMMAND,
} from './project.eventing'

afterAll(() => sql.end())

describe('project eventing', () => {
  const runtime = createRuntime()

  beforeEach(resetTestDatabase)

  it('creates a project event and both required projections atomically', async () => {
    const result = await runtime.commands.dispatch(command(
      CREATE_PROJECT_COMMAND,
      { title: '雾港来信', genre: '悬疑', targetWords: 120000 },
    ))

    expect(result).toMatchObject({ id: 'project-1', title: '雾港来信', status: 'planning' })
    await expect(runtime.store.loadStream(projectStream())).resolves.toMatchObject([
      { eventType: 'ProjectCreated', aggregateVersion: 1, projectId: 'project-1' },
    ])
    await expect(readProject(projectReadModels)).resolves.toMatchObject({
      id: 'project-1',
      title: '雾港来信',
    })
    await expect(readProject(novelProjects)).resolves.toMatchObject({
      id: 'project-1',
      title: '雾港来信',
    })
  })

  it('updates a project from aggregate state and rejects a missing project', async () => {
    await runtime.commands.dispatch(command(CREATE_PROJECT_COMMAND, { title: '初稿' }))

    await expect(runtime.commands.dispatch(command(
      UPDATE_PROJECT_COMMAND,
      { title: '修订稿', theme: '信任' },
      'command-update',
    ))).resolves.toMatchObject({ title: '修订稿', theme: '信任' })
    await expect(readProject(projectReadModels)).resolves.toMatchObject({
      title: '修订稿',
      theme: '信任',
    })

    await expect(runtime.commands.dispatch(command(
      UPDATE_PROJECT_COMMAND,
      { title: '不存在' },
      'command-missing',
      'missing-project',
    ))).rejects.toMatchObject({ code: 'PROJECT_NOT_FOUND' })
  })

  it('records deletion intent before deleting both projections', async () => {
    await runtime.commands.dispatch(command(CREATE_PROJECT_COMMAND, { title: '待删除项目' }))

    await expect(runtime.commands.dispatch(command(
      DELETE_PROJECT_COMMAND,
      {},
      'command-delete',
    ))).resolves.toMatchObject({ id: 'project-1', title: '待删除项目' })

    expect((await runtime.store.loadStream(projectStream())).map(event => event.eventType)).toEqual([
      'ProjectCreated',
      'ProjectDeletionRequested',
      'ProjectDeleted',
    ])
    await expect(readProject(projectReadModels)).resolves.toBeUndefined()
    await expect(readProject(novelProjects)).resolves.toBeUndefined()
  })

  it('rebuilds the primary project read model without resetting the legacy FK projection', async () => {
    await runtime.commands.dispatch(command(CREATE_PROJECT_COMMAND, { title: '可回放项目' }))
    await runtime.commands.dispatch(command(
      UPDATE_PROJECT_COMMAND,
      { description: '来自事件的描述' },
      'command-update',
    ))
    const expected = await readProject(projectReadModels)
    await db.delete(projectReadModels).where(eq(projectReadModels.id, 'project-1'))

    await new ProjectionReplay(runtime.projections, runtime.store)
      .replayProjection(PROJECT_PROJECTION)

    await expect(readProject(projectReadModels)).resolves.toEqual(expected)
    await expect(readProject(novelProjects)).resolves.toMatchObject({ id: 'project-1' })
  })
})

function createRuntime() {
  const store = new EventStore()
  const events = new EventRegistry()
  const projections = new ProjectionRegistry()
  const commands = new CommandBus(store, projections)
  const aggregates = new AggregateRepository(store, events)
  registerProjectEventing({ aggregates, commands, events, projections })
  return { commands, events, projections, store }
}

function command(
  commandType: string,
  payload: JsonObject,
  commandId = 'command-create',
  projectId = 'project-1',
): CommandEnvelope {
  return {
    commandId,
    commandType,
    aggregateType: 'Project',
    aggregateId: projectId,
    projectId,
    correlationId: commandId,
    payload,
  }
}

function projectStream() {
  return {
    aggregateType: 'Project',
    aggregateId: 'project-1',
    projectId: 'project-1',
  }
}

async function readProject(table: typeof novelProjects | typeof projectReadModels) {
  const [row] = await db.select().from(table).where(eq(table.id, 'project-1')).limit(1)
  return row
}
