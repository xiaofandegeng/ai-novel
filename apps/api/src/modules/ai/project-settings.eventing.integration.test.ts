import type { CommandEnvelope, JsonObject } from '../../eventing'
import { Buffer } from 'node:buffer'
import { eq } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { db, sql } from '../../db'
import { projectAISettings } from '../../db/schema'
import {
  AggregateRepository,
  CommandBus,
  EventRegistry,
  EventStore,
  ProjectionRegistry,
  ProjectionReplay,
} from '../../eventing'
import { CredentialVault } from '../../security/credential-vault'
import { resetTestDatabase } from '../../test/database'
import {
  CREATE_PROJECT_COMMAND,
  DELETE_PROJECT_COMMAND,
  registerProjectEventing,
} from '../project/project.eventing'
import {
  CHANGE_PROJECT_AI_SETTINGS_COMMAND,
  PROJECT_AI_SETTINGS_PROJECTION,
  registerProjectSettingsEventing,
} from './project-settings.eventing'

const credentialKey = Buffer.alloc(32, 7).toString('base64')

afterAll(() => sql.end())

describe('project settings eventing', () => {
  const runtime = createRuntime()

  beforeEach(resetTestDatabase)

  it('stores project-scoped settings and credential references without plaintext secrets', async () => {
    await createProject(runtime.commands)

    const result = await runtime.commands.dispatch(settingsCommand({
      ...settingsPayload(),
      credentialRef: 'credential-chat-1',
      credentialSuffix: 'chat',
      embeddingCredentialRef: 'credential-embedding-1',
      embeddingCredentialSuffix: 'ding',
    }))

    expect(result).toMatchObject({
      projectId: 'project-1',
      provider: 'openai',
      credentialRef: 'credential-chat-1',
    })
    const events = await runtime.store.loadStream(settingsStream())
    expect(events.map(event => event.eventType)).toEqual([
      'AIProviderSelected',
      'CredentialReferenceChanged',
      'ProjectSettingsChanged',
    ])
    expect(JSON.stringify(events)).not.toContain('sk-private')
    const projected = await readSettings()
    expect(projected).toMatchObject({
      projectId: 'project-1',
      credentialRef: 'credential-chat-1',
      credentialSuffix: 'chat',
    })
    expect(projected).not.toHaveProperty('apiKey')
  })

  it('rejects settings for a project that does not exist', async () => {
    await expect(runtime.commands.dispatch(settingsCommand(settingsPayload())))
      .rejects
      .toMatchObject({ code: 'PROJECT_NOT_FOUND' })
    await expect(readSettings()).resolves.toBeUndefined()
  })

  it('rebuilds the settings projection from its event stream', async () => {
    await createProject(runtime.commands)
    await runtime.commands.dispatch(settingsCommand(settingsPayload()))
    const expected = await readSettings()
    await db.delete(projectAISettings).where(eq(projectAISettings.projectId, 'project-1'))

    await new ProjectionReplay(runtime.projections, runtime.store)
      .replayProjection(PROJECT_AI_SETTINGS_PROJECTION, { projectId: 'project-1' })

    await expect(readSettings()).resolves.toEqual(expected)
  })

  it('removes settings and encrypted credentials when the project is deleted', async () => {
    await createProject(runtime.commands)
    const credential = await runtime.vault.store({
      projectId: 'project-1',
      kind: 'chat',
      secret: 'sk-private',
    })
    await runtime.commands.dispatch(settingsCommand({
      ...settingsPayload(),
      credentialRef: credential.credentialRef,
      credentialSuffix: credential.maskedSuffix,
    }))

    await runtime.commands.dispatch(projectCommand(DELETE_PROJECT_COMMAND, {}, 'command-delete'))

    await expect(readSettings()).resolves.toBeUndefined()
    await expect(runtime.vault.resolve({
      projectId: 'project-1',
      kind: 'chat',
      credentialRef: credential.credentialRef,
    })).resolves.toBeNull()
  })
})

function createRuntime() {
  const store = new EventStore()
  const events = new EventRegistry()
  const projections = new ProjectionRegistry()
  const commands = new CommandBus(store, projections)
  const aggregates = new AggregateRepository(store, events)
  const vault = CredentialVault.fromBase64Key(credentialKey)
  registerProjectEventing({ aggregates, commands, events, projections })
  registerProjectSettingsEventing({ aggregates, commands, events, projections })
  return { commands, events, projections, store, vault }
}

async function createProject(commands: CommandBus): Promise<void> {
  await commands.dispatch(projectCommand(CREATE_PROJECT_COMMAND, { title: '设置测试项目' }))
}

function projectCommand(
  commandType: string,
  payload: JsonObject,
  commandId = 'command-create-project',
): CommandEnvelope {
  return {
    commandId,
    commandType,
    aggregateType: 'Project',
    aggregateId: 'project-1',
    projectId: 'project-1',
    correlationId: commandId,
    payload,
  }
}

function settingsCommand(payload: JsonObject): CommandEnvelope {
  return {
    commandId: 'command-settings',
    commandType: CHANGE_PROJECT_AI_SETTINGS_COMMAND,
    aggregateType: 'ProjectSettings',
    aggregateId: 'project-1',
    projectId: 'project-1',
    correlationId: 'command-settings',
    payload,
  }
}

function settingsPayload(): JsonObject {
  return {
    provider: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    temperature: 70,
    credentialRef: null,
    credentialSuffix: null,
    embeddingProvider: 'openai',
    embeddingBaseUrl: 'https://api.openai.com/v1',
    embeddingModel: 'text-embedding-3-small',
    embeddingCredentialRef: null,
    embeddingCredentialSuffix: null,
    embeddingEnabled: true,
  }
}

function settingsStream() {
  return {
    aggregateType: 'ProjectSettings',
    aggregateId: 'project-1',
    projectId: 'project-1',
  }
}

async function readSettings() {
  const [row] = await db.select()
    .from(projectAISettings)
    .where(eq(projectAISettings.projectId, 'project-1'))
    .limit(1)
  return row
}
