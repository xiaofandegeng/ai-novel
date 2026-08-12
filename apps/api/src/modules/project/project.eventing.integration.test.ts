import type { DeleteProjectResult } from '@ai-novel/shared'
import type { CommandEnvelope, JsonObject } from '../../eventing'
import { Buffer } from 'node:buffer'
import { eq } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { db, sql } from '../../db'
import {
  commandReceipts,
  credentialVaultEntries,
  domainEvents,
  knowledgeEmbeddings,
  novelProjects,
  projectAISettings,
  projectDataKeys,
  projectReadModels,
} from '../../db/schema'
import {
  AggregateRepository,
  CommandBus,
  EventRegistry,
  EventStore,
  ProjectEventingContentProtector,
  ProjectionRegistry,
  ProjectionReplay,
} from '../../eventing'
import { CredentialVault } from '../../security/credential-vault'
import { ProjectDataKeyStore } from '../../security/project-data-key.store'
import { resetTestDatabase } from '../../test/database'
import {
  CHANGE_PROJECT_AI_SETTINGS_COMMAND,
  registerProjectSettingsEventing,
} from '../ai/project-settings.eventing'
import {
  CREATE_PROJECT_COMMAND,
  DELETE_PROJECT_COMMAND,
  PROJECT_CREATED,
  PROJECT_DELETED,
  PROJECT_PROJECTION,
  registerProjectEventing,
  UPDATE_PROJECT_COMMAND,
} from './project.eventing'

const credentialKey = Buffer.alloc(32, 23).toString('base64')

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

  it('atomically removes project content and credentials before shredding its key', async () => {
    await runtime.commands.dispatch(command(CREATE_PROJECT_COMMAND, { title: '待删除项目' }))
    const protectedCommandBeforeDelete = command(
      UPDATE_PROJECT_COMMAND,
      { title: '删除前的保护回执' },
      'command-before-delete',
    )
    await runtime.commands.dispatch(protectedCommandBeforeDelete)
    const credential = await runtime.vault.store({
      projectId: 'project-1',
      kind: 'chat',
      secret: 'sk-delete-me',
    })
    await runtime.commands.dispatch(settingsCommand({
      ...settingsPayload(),
      credentialRef: credential.credentialRef,
      credentialSuffix: credential.maskedSuffix,
    }))
    await db.insert(knowledgeEmbeddings).values({
      id: 'embedding-1',
      projectId: 'project-1',
      sourceId: null,
      chunkId: null,
      embeddingModel: 'test-model',
      embeddingVector: null,
      contentType: 'knowledge_summary',
      contentHash: 'delete-me',
    })

    const deleted = await runtime.commands.dispatch<DeleteProjectResult>(command(
      DELETE_PROJECT_COMMAND,
      {},
      'command-delete',
    ))

    expect(deleted).toEqual({
      id: 'project-1',
      deleted: true,
      deletedAt: expect.any(String),
    })
    const repeatedDelete = await runtime.commands.dispatch<DeleteProjectResult>(command(
      DELETE_PROJECT_COMMAND,
      {},
      'command-delete',
    ))
    expect(repeatedDelete).toEqual(deleted)
    const eventHeaders = await db.select({ eventType: domainEvents.eventType })
      .from(domainEvents)
      .where(eq(domainEvents.projectId, 'project-1'))
    expect(eventHeaders.map(event => event.eventType).filter(eventType => [
      'ProjectCreated',
      'ProjectDeletionRequested',
      'ProjectDeleted',
    ].includes(eventType))).toEqual([
      'ProjectCreated',
      'ProjectDeletionRequested',
      'ProjectDeleted',
    ])
    await expect(readProject(projectReadModels)).resolves.toBeUndefined()
    await expect(readProject(novelProjects)).resolves.toBeUndefined()
    await expect(readByProject(projectAISettings)).resolves.toEqual([])
    await expect(readByProject(credentialVaultEntries)).resolves.toEqual([])
    await expect(readByProject(knowledgeEmbeddings)).resolves.toEqual([])
    const [key] = await db.select()
      .from(projectDataKeys)
      .where(eq(projectDataKeys.projectId, 'project-1'))
      .limit(1)
    expect(key).toMatchObject({
      wrappedKey: null,
    })
    expect(new Date(key!.destroyedAt!).toISOString()).toBe(deleted.deletedAt)
    const [deleteReceipt] = await db.select()
      .from(commandReceipts)
      .where(eq(commandReceipts.commandId, 'command-delete'))
      .limit(1)
    expect(deleteReceipt?.result).toEqual({
      format: 'command-receipt-result-v1',
      receiptProtection: 'none',
      plaintext: deleted,
    })
    await expect(runtime.commands.dispatch(protectedCommandBeforeDelete))
      .rejects
      .toMatchObject({ code: 'PROJECT_NOT_FOUND' })

    const commandAfterDelete = command(
      UPDATE_PROJECT_COMMAND,
      { title: '不应解密' },
      'command-after-delete',
    )
    await expect(runtime.commands.dispatch(commandAfterDelete))
      .rejects
      .toMatchObject({ code: 'PROJECT_NOT_FOUND' })
    await expect(runtime.commands.dispatch(commandAfterDelete))
      .rejects
      .toMatchObject({ code: 'PROJECT_NOT_FOUND', message: 'Command was rejected' })
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
  const events = new EventRegistry()
  const contentProtector = new ProjectEventingContentProtector(
    events,
    new ProjectDataKeyStore(Buffer.alloc(32, 29)),
    {
      projectCreatedEventType: PROJECT_CREATED,
      projectDeletedEventType: PROJECT_DELETED,
    },
  )
  const store = new EventStore({ contentProtector, projectDeletedEventType: PROJECT_DELETED })
  const projections = new ProjectionRegistry(events)
  const commands = new CommandBus(store, projections, events)
  const aggregates = new AggregateRepository(store, events)
  const vault = CredentialVault.fromBase64Key(credentialKey)
  registerProjectEventing({ aggregates, commands, events, projections })
  registerProjectSettingsEventing({ aggregates, commands, events, projections })
  return { commands, events, projections, store, vault }
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

async function readProject(table: typeof novelProjects | typeof projectReadModels) {
  const [row] = await db.select().from(table).where(eq(table.id, 'project-1')).limit(1)
  return row
}

function readByProject(
  table: typeof projectAISettings | typeof credentialVaultEntries | typeof knowledgeEmbeddings,
) {
  return db.select().from(table).where(eq(table.projectId, 'project-1'))
}
