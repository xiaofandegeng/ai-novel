import { Buffer } from 'node:buffer'
import { eq } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { db, sql } from '../../db'
import {
  commandReceipts,
  credentialVaultEntries,
  domainEvents,
  projectAISettings,
} from '../../db/schema'
import { createProject } from '../project/projects.service'
import { getAISettings, getEffectiveAISettings, updateAISettings } from './ai.service'

const MASTER_KEY = Buffer.alloc(32, 9).toString('base64')

describe('project AI settings service', () => {
  beforeEach(async () => {
    vi.stubEnv('AI_CREDENTIAL_MASTER_KEY', MASTER_KEY)
    vi.stubEnv('AI_API_KEY', '')
    vi.stubEnv('AI_EMBEDDING_API_KEY', '')
    const { resetTestDatabase } = await import('../../test/database')
    await resetTestDatabase()
  })

  afterAll(async () => {
    vi.unstubAllEnvs()
    await sql.end()
  })

  it('stores credentials before dispatch without leaking plaintext to event data', async () => {
    const project = await createProject({ title: '隔离设置' })

    const result = await updateAISettings(project.id, {
      provider: 'openai',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-test',
      apiKey: 'private-chat-key',
      embeddingApiKey: 'private-embedding-key',
      temperature: 120,
    })

    expect(result).toMatchObject({
      hasApiKey: true,
      hasEmbeddingApiKey: true,
      temperature: 100,
    })
    expect(result).not.toHaveProperty('apiKey')

    const [projection] = await db.select()
      .from(projectAISettings)
      .where(eq(projectAISettings.projectId, project.id))
    expect(projection).toMatchObject({
      projectId: project.id,
      credentialSuffix: '-key',
      embeddingCredentialSuffix: '-key',
    })

    const persisted = JSON.stringify({
      events: await db.select().from(domainEvents),
      receipts: await db.select().from(commandReceipts),
      projection,
    })
    expect(persisted).not.toContain('private-chat-key')
    expect(persisted).not.toContain('private-embedding-key')
    expect(await getAISettings(project.id)).toEqual(result)
  })

  it('deletes newly stored credentials when the command is rejected', async () => {
    const project = await createProject({ title: '失败补偿' })

    await expect(updateAISettings(project.id, {
      apiKey: 'unused-private-key',
      temperature: Number.NaN,
    })).rejects.toMatchObject({
      code: 'INVALID_PROJECT_SETTINGS',
    })

    expect(await db.select().from(credentialVaultEntries)).toEqual([])
    expect(JSON.stringify(await db.select().from(commandReceipts)))
      .not
      .toContain('unused-private-key')
  })

  it('never resolves another project credentials through a settings read', async () => {
    const first = await createProject({ title: '项目甲' })
    const second = await createProject({ title: '项目乙' })
    await updateAISettings(first.id, { apiKey: 'project-a-secret' })

    const secondSettings = await getAISettings(second.id)

    expect(secondSettings.hasApiKey).toBe(false)
  })

  it('rejects AI settings resolution without an explicit project scope', async () => {
    const resolveWithoutProject = getEffectiveAISettings as (projectId?: string) => ReturnType<typeof getEffectiveAISettings>

    await expect(resolveWithoutProject()).rejects.toMatchObject({
      code: 'PROJECT_SCOPE_REQUIRED',
    })
  })
})
