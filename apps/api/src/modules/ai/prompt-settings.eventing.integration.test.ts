import type { CommandEnvelope, JsonObject } from '../../eventing'
import { and, eq } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { db, sql } from '../../db'
import { projectPromptOverrides } from '../../db/schema'
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
  registerProjectEventing,
} from '../project/project.eventing'
import {
  PROJECT_PROMPT_OVERRIDES_PROJECTION,
  promptOverrideAggregateId,
  registerPromptSettingsEventing,
  SET_PROJECT_PROMPT_OVERRIDE_COMMAND,
} from './prompt-settings.eventing'

afterAll(() => sql.end())

describe('project prompt override eventing', () => {
  const runtime = createRuntime()

  beforeEach(resetTestDatabase)

  it('selects a template and projects its project override', async () => {
    await createProject(runtime.commands, 'project-1')

    const result = await runtime.commands.dispatch(promptCommand('project-1', {
      templateKey: 'draft_generate',
      overrideSystemPrompt: '系统覆盖',
      overrideUserPromptTemplate: '续写 {{title}}',
      enabled: true,
    }))

    expect(result).toMatchObject({
      id: promptOverrideAggregateId('project-1', 'draft_generate'),
      projectId: 'project-1',
      templateKey: 'draft_generate',
      created: true,
    })
    expect((await runtime.store.loadStream(promptStream('project-1'))).map(event => event.eventType))
      .toEqual(['PromptTemplateSelected', 'ProjectPromptOverrideChanged'])
    await expect(readOverride('project-1')).resolves.toMatchObject({
      overrideSystemPrompt: '系统覆盖',
      overrideUserPromptTemplate: '续写 {{title}}',
      enabled: 1,
    })
  })

  it('updates the same stream while preserving omitted override fields', async () => {
    await createProject(runtime.commands, 'project-1')
    await runtime.commands.dispatch(promptCommand('project-1', {
      templateKey: 'draft_generate',
      overrideSystemPrompt: '保留的系统覆盖',
      enabled: true,
    }))

    const result = await runtime.commands.dispatch(promptCommand('project-1', {
      templateKey: 'draft_generate',
      overrideUserPromptTemplate: '新的用户覆盖',
    }, 'command-update'))

    expect(result).toMatchObject({ created: false })
    await expect(readOverride('project-1')).resolves.toMatchObject({
      overrideSystemPrompt: '保留的系统覆盖',
      overrideUserPromptTemplate: '新的用户覆盖',
      enabled: 1,
    })
  })

  it('rejects missing projects and removes overrides with their project', async () => {
    await expect(runtime.commands.dispatch(promptCommand('missing-project', {
      templateKey: 'draft_generate',
      enabled: true,
    }, 'command-missing'))).rejects.toMatchObject({ code: 'PROJECT_NOT_FOUND' })

    await createProject(runtime.commands, 'project-1')
    await runtime.commands.dispatch(promptCommand('project-1', {
      templateKey: 'draft_generate',
      enabled: true,
    }))
    await runtime.commands.dispatch(projectCommand(
      DELETE_PROJECT_COMMAND,
      'project-1',
      {},
      'command-delete-project-1',
    ))

    await expect(readOverride('project-1')).resolves.toBeUndefined()
  })

  it('replays one project without changing another project override', async () => {
    await createProject(runtime.commands, 'project-1')
    await createProject(runtime.commands, 'project-2')
    await runtime.commands.dispatch(promptCommand('project-1', {
      templateKey: 'draft_generate',
      overrideSystemPrompt: '项目一',
      enabled: true,
    }))
    await runtime.commands.dispatch(promptCommand('project-2', {
      templateKey: 'draft_generate',
      overrideSystemPrompt: '项目二',
      enabled: true,
    }, 'command-project-2'))
    const otherBefore = await readOverride('project-2')
    await db.delete(projectPromptOverrides)
      .where(eq(projectPromptOverrides.projectId, 'project-1'))

    await new ProjectionReplay(runtime.projections, runtime.store)
      .replayProjection(PROJECT_PROMPT_OVERRIDES_PROJECTION, { projectId: 'project-1' })

    await expect(readOverride('project-1')).resolves.toMatchObject({ overrideSystemPrompt: '项目一' })
    await expect(readOverride('project-2')).resolves.toEqual(otherBefore)
  })
})

function createRuntime() {
  const store = new EventStore()
  const events = new EventRegistry()
  const projections = new ProjectionRegistry()
  const commands = new CommandBus(store, projections)
  const aggregates = new AggregateRepository(store, events)
  registerProjectEventing({ aggregates, commands, events, projections })
  registerPromptSettingsEventing({ aggregates, commands, events, projections })
  return { commands, events, projections, store }
}

async function createProject(commands: CommandBus, projectId: string): Promise<void> {
  await commands.dispatch(projectCommand(
    CREATE_PROJECT_COMMAND,
    projectId,
    { title: `项目 ${projectId}` },
    `command-create-${projectId}`,
  ))
}

function projectCommand(
  commandType: string,
  projectId: string,
  payload: JsonObject,
  commandId: string,
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

function promptCommand(
  projectId: string,
  payload: JsonObject,
  commandId = 'command-prompt',
): CommandEnvelope {
  const templateKey = String(payload.templateKey)
  return {
    commandId,
    commandType: SET_PROJECT_PROMPT_OVERRIDE_COMMAND,
    aggregateType: 'ProjectPromptOverride',
    aggregateId: promptOverrideAggregateId(projectId, templateKey),
    projectId,
    correlationId: commandId,
    payload,
  }
}

function promptStream(projectId: string) {
  return {
    aggregateType: 'ProjectPromptOverride',
    aggregateId: promptOverrideAggregateId(projectId, 'draft_generate'),
    projectId,
  }
}

async function readOverride(projectId: string) {
  const [row] = await db.select()
    .from(projectPromptOverrides)
    .where(and(
      eq(projectPromptOverrides.projectId, projectId),
      eq(projectPromptOverrides.templateKey, 'draft_generate'),
    ))
    .limit(1)
  return row
}
