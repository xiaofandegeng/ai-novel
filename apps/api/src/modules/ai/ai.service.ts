import type { AIProviderId, UpdateAIProviderSettingsInput } from '@ai-novel/shared'
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions'
import type { JsonObject } from '../../eventing'
import type { ProjectAISettingsSnapshot } from './project-settings.eventing'
import { AI_PROVIDER_PRESETS } from '@ai-novel/shared'
import { eq } from 'drizzle-orm'
import OpenAI from 'openai'
import { getAIEnvironmentConfig } from '../../config/environment'
import { db } from '../../db'
import { projectAISettings, projectReadModels } from '../../db/schema'
import { DomainCommandError } from '../../eventing'
import { commandBus } from '../../eventing-runtime'
import { CredentialVault } from '../../security/credential-vault'
import { errorMessage, generateId } from '../../shared/utils'
import { fakeAIEmbedding, fakeAIJSON, isFakeAIEnabled } from './ai-fake-provider'
import { AIUsageService } from './ai-usage.service'
import {
  CHANGE_PROJECT_AI_SETTINGS_COMMAND,
  PROJECT_SETTINGS_AGGREGATE_TYPE,
} from './project-settings.eventing'

interface AIMetadata {
  projectId: string
  chapterId?: string
  contextSnapshotId?: string
  taskType?: string
}

function errorField(error: unknown, field: string): unknown {
  return error && typeof error === 'object' && field in error
    ? (error as Record<string, unknown>)[field]
    : undefined
}

export class AIError extends Error {
  constructor(message: string, public code: string, public status?: number) {
    super(message)
    this.name = 'AIError'
  }
}

export class AIParseError extends AIError {
  constructor(message: string, public rawContent: string) {
    super(message, 'PARSE_ERROR')
    this.name = 'AIParseError'
  }
}

export class AIConfigurationError extends AIError {
  constructor(message: string) {
    super(message, 'CONFIG_ERROR')
    this.name = 'AIConfigurationError'
  }
}

export class AIProjectScopeError extends AIError {
  constructor() {
    super('AI execution requires an explicit project ID', 'PROJECT_SCOPE_REQUIRED')
    this.name = 'AIProjectScopeError'
  }
}

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

interface EffectiveAISettings {
  provider: AIProviderId | string
  baseUrl: string
  model: string
  apiKey?: string | null
  temperature: number

  embeddingProvider?: string | null
  embeddingBaseUrl?: string | null
  embeddingModel?: string | null
  embeddingApiKey?: string | null
  embeddingEnabled?: boolean | null

  updatedAt?: string
}

function defaultAISettings(): EffectiveAISettings {
  const fallbackPreset = AI_PROVIDER_PRESETS.find(p => p.id === 'openai') || AI_PROVIDER_PRESETS[0]
  const environment = getAIEnvironmentConfig()
  return {
    provider: environment.provider || fallbackPreset.id,
    baseUrl: environment.baseUrl || fallbackPreset.baseUrl,
    model: environment.model || fallbackPreset.defaultModel,
    apiKey: environment.apiKey,
    temperature: environment.temperature ?? 70,

    embeddingProvider: environment.embeddingProvider || fallbackPreset.id,
    embeddingBaseUrl: environment.embeddingBaseUrl || fallbackPreset.baseUrl,
    embeddingModel: environment.embeddingModel || fallbackPreset.defaultEmbeddingModel || 'text-embedding-3-small',
    embeddingApiKey: environment.embeddingApiKey,
    embeddingEnabled: true,
  }
}

export function sanitizeAISettings(settings: EffectiveAISettings) {
  return {
    provider: settings.provider,
    baseUrl: settings.baseUrl,
    model: settings.model,
    temperature: settings.temperature,
    hasApiKey: Boolean(settings.apiKey),

    embeddingProvider: settings.embeddingProvider ?? undefined,
    embeddingBaseUrl: settings.embeddingBaseUrl ?? undefined,
    embeddingModel: settings.embeddingModel ?? undefined,
    hasEmbeddingApiKey: Boolean(settings.embeddingApiKey),
    embeddingEnabled: settings.embeddingEnabled ?? true,

    updatedAt: settings.updatedAt ?? undefined,
  }
}

export async function getEffectiveAISettings(projectId: string): Promise<EffectiveAISettings> {
  if (!projectId)
    throw new AIProjectScopeError()

  await assertProjectExists(projectId)
  const fallback = defaultAISettings()
  const [saved] = await db.select()
    .from(projectAISettings)
    .where(eq(projectAISettings.projectId, projectId))
    .limit(1)
  if (!saved)
    return fallback

  const vault = saved.credentialRef || saved.embeddingCredentialRef
    ? CredentialVault.fromEnvironment()
    : null
  const apiKey = saved.credentialRef && vault
    ? await vault.resolve({
        credentialRef: saved.credentialRef,
        projectId,
        kind: 'chat',
      })
    : null
  const embeddingApiKey = saved.embeddingCredentialRef && vault
    ? await vault.resolve({
        credentialRef: saved.embeddingCredentialRef,
        projectId,
        kind: 'embedding',
      })
    : apiKey

  return {
    provider: saved.provider,
    baseUrl: saved.baseUrl,
    model: saved.model,
    apiKey,
    temperature: saved.temperature,
    embeddingProvider: saved.embeddingProvider,
    embeddingBaseUrl: saved.embeddingBaseUrl,
    embeddingModel: saved.embeddingModel,
    embeddingApiKey,
    embeddingEnabled: saved.embeddingEnabled,
    updatedAt: saved.updatedAt,
  }
}

export async function getAISettings(projectId: string) {
  return sanitizeAISettings(await getEffectiveAISettings(projectId))
}

export function listAIProviderPresets() {
  return AI_PROVIDER_PRESETS
}

function normalizeEmbeddingModel(input: {
  provider: string
  model: string
  embeddingProvider?: string | null
  embeddingModel?: string | null
}) {
  const embeddingModel = input.embeddingModel?.trim()
  if (!embeddingModel)
    return ''

  const provider = input.embeddingProvider || input.provider
  const preset = AI_PROVIDER_PRESETS.find(p => p.id === provider)

  // UI forms can accidentally copy the chat model into the embedding field.
  // For known providers, prefer the provider's embedding model so RAG failures
  // do not block ordinary writing and analysis requests before generation starts.
  if (
    preset?.defaultEmbeddingModel
    && embeddingModel === input.model
    && preset.defaultEmbeddingModel !== input.model
  ) {
    return preset.defaultEmbeddingModel
  }

  return embeddingModel
}

function normalizeAISettingsInput(input: UpdateAIProviderSettingsInput, current: EffectiveAISettings) {
  const provider = input.provider?.trim() || current.provider
  const preset = AI_PROVIDER_PRESETS.find(p => p.id === provider)
  const baseUrl = input.baseUrl?.trim() || preset?.baseUrl || current.baseUrl
  const model = input.model?.trim() || preset?.defaultModel || current.model

  const embeddingProvider = input.embeddingProvider?.trim() || current.embeddingProvider || provider
  const embeddingPreset = AI_PROVIDER_PRESETS.find(p => p.id === embeddingProvider)
  const embeddingBaseUrl = input.embeddingBaseUrl?.trim() || embeddingPreset?.baseUrl || baseUrl
  const embeddingModel = normalizeEmbeddingModel({
    provider,
    model,
    embeddingProvider,
    embeddingModel: input.embeddingModel?.trim() || current.embeddingModel,
  }) || embeddingPreset?.defaultEmbeddingModel || 'text-embedding-3-small'

  return { provider, baseUrl, model, embeddingProvider, embeddingBaseUrl, embeddingModel }
}

export interface AISettingsCommandOptions {
  commandId?: string
  correlationId?: string
}

export async function updateAISettings(
  projectId: string,
  input: UpdateAIProviderSettingsInput,
  options: AISettingsCommandOptions = {},
) {
  const [saved] = await db.select()
    .from(projectAISettings)
    .where(eq(projectAISettings.projectId, projectId))
    .limit(1)
  const current = await getEffectiveAISettings(projectId)
  const normalized = normalizeAISettingsInput(input, current)
  const newCredentials: string[] = []
  const vaultSecrets = {
    chat: input.apiKey?.trim() || (!saved && !input.clearApiKey ? current.apiKey : null),
    embedding: input.embeddingApiKey?.trim()
      || (!saved && !input.clearEmbeddingApiKey ? current.embeddingApiKey : null),
  }
  const vault = vaultSecrets.chat || vaultSecrets.embedding
    ? CredentialVault.fromEnvironment()
    : null

  const chatCredential = vaultSecrets.chat && vault
    ? await vault.store({ projectId, kind: 'chat', secret: vaultSecrets.chat })
    : null
  if (chatCredential)
    newCredentials.push(chatCredential.credentialRef)

  let embeddingCredential
  try {
    embeddingCredential = vaultSecrets.embedding && vault
      ? await vault.store({ projectId, kind: 'embedding', secret: vaultSecrets.embedding })
      : null
    if (embeddingCredential)
      newCredentials.push(embeddingCredential.credentialRef)
  }
  catch (error: unknown) {
    await deleteCredentials(newCredentials, projectId)
    throw error
  }

  const next: JsonObject = {
    provider: normalized.provider,
    baseUrl: normalized.baseUrl,
    model: normalized.model,
    temperature: typeof input.temperature === 'number'
      ? Math.min(100, Math.max(0, Math.round(input.temperature)))
      : current.temperature,
    credentialRef: input.clearApiKey
      ? null
      : chatCredential?.credentialRef ?? saved?.credentialRef ?? null,
    credentialSuffix: input.clearApiKey
      ? null
      : chatCredential?.maskedSuffix ?? saved?.credentialSuffix ?? null,
    embeddingProvider: normalized.embeddingProvider,
    embeddingBaseUrl: normalized.embeddingBaseUrl,
    embeddingModel: normalized.embeddingModel,
    embeddingCredentialRef: input.clearEmbeddingApiKey
      ? null
      : embeddingCredential?.credentialRef ?? saved?.embeddingCredentialRef ?? null,
    embeddingCredentialSuffix: input.clearEmbeddingApiKey
      ? null
      : embeddingCredential?.maskedSuffix ?? saved?.embeddingCredentialSuffix ?? null,
    embeddingEnabled: typeof input.embeddingEnabled === 'boolean' ? input.embeddingEnabled : current.embeddingEnabled,
  }

  let result: ProjectAISettingsSnapshot
  try {
    const commandId = options.commandId ?? generateId()
    result = await commandBus.dispatch<ProjectAISettingsSnapshot>({
      commandId,
      commandType: CHANGE_PROJECT_AI_SETTINGS_COMMAND,
      aggregateType: PROJECT_SETTINGS_AGGREGATE_TYPE,
      aggregateId: projectId,
      projectId,
      correlationId: options.correlationId ?? commandId,
      payload: next,
    })
  }
  catch (error: unknown) {
    await deleteCredentials(newCredentials, projectId)
    throw error
  }

  await deleteUnusedCredentials({
    projectId,
    saved,
    result,
    newCredentials,
  })

  return getAISettings(projectId)
}

async function assertProjectExists(projectId: string): Promise<void> {
  const [project] = await db.select({ id: projectReadModels.id })
    .from(projectReadModels)
    .where(eq(projectReadModels.id, projectId))
    .limit(1)
  if (!project)
    throw new DomainCommandError('PROJECT_NOT_FOUND', 'Project not found')
}

async function deleteCredentials(credentialRefs: string[], projectId: string): Promise<void> {
  if (!credentialRefs.length)
    return
  const vault = CredentialVault.fromEnvironment()
  await Promise.all(credentialRefs.map(ref => vault.delete(ref, projectId)))
}

async function deleteUnusedCredentials(input: {
  projectId: string
  saved: typeof projectAISettings.$inferSelect | undefined
  result: ProjectAISettingsSnapshot
  newCredentials: string[]
}): Promise<void> {
  const referenced = new Set([
    input.result.credentialRef,
    input.result.embeddingCredentialRef,
  ].filter((value): value is string => Boolean(value)))
  const obsolete = new Set(
    input.newCredentials.filter(ref => !referenced.has(ref)),
  )
  if (input.saved?.credentialRef && input.saved.credentialRef !== input.result.credentialRef)
    obsolete.add(input.saved.credentialRef)
  if (
    input.saved?.embeddingCredentialRef
    && input.saved.embeddingCredentialRef !== input.result.embeddingCredentialRef
  ) {
    obsolete.add(input.saved.embeddingCredentialRef)
  }

  await deleteCredentials([...obsolete], input.projectId)
}

export function createOpenAIClient(settings: { apiKey?: string | null, baseUrl: string }) {
  return new OpenAI({
    apiKey: settings.apiKey || 'missing-key',
    baseURL: settings.baseUrl,
  })
}

export async function testAIConnection(projectId: string, input?: UpdateAIProviderSettingsInput) {
  const saved = await getEffectiveAISettings(projectId)
  const normalized = input ? normalizeAISettingsInput(input, saved) : saved
  const settings = {
    provider: normalized.provider,
    baseUrl: normalized.baseUrl,
    model: normalized.model,
    apiKey: input?.apiKey?.trim() || saved.apiKey,
    temperature: typeof input?.temperature === 'number' ? input.temperature : saved.temperature,
  }

  if (!settings.apiKey) {
    return {
      ok: false,
      message: 'AI API Key 未配置',
      model: settings.model,
    }
  }

  const startedAt = Date.now()
  const client = createOpenAIClient(settings)
  await client.chat.completions.create({
    model: settings.model,
    messages: [{ role: 'user', content: '请回复“连接正常”。' }],
    max_tokens: 16,
    temperature: settings.temperature / 100,
  })

  return {
    ok: true,
    message: 'AI 服务连接正常',
    model: settings.model,
    latencyMs: Date.now() - startedAt,
  }
}

export async function testEmbeddingConnection(projectId: string, input?: UpdateAIProviderSettingsInput) {
  const saved = await getEffectiveAISettings(projectId)
  const normalized = input ? normalizeAISettingsInput(input, saved) : saved
  const settings = {
    provider: normalized.embeddingProvider,
    baseUrl: normalized.embeddingBaseUrl || normalized.baseUrl,
    model: normalized.embeddingModel,
    apiKey: input?.embeddingApiKey?.trim() || input?.apiKey?.trim() || saved.embeddingApiKey || saved.apiKey,
  }

  if (!settings.apiKey) {
    return {
      ok: false,
      message: 'Embedding API Key 未配置',
      model: settings.model,
    }
  }

  const startedAt = Date.now()
  const client = createOpenAIClient(settings)
  const response = await client.embeddings.create({
    model: settings.model || 'text-embedding-3-small',
    input: 'test',
  })

  return {
    ok: true,
    message: 'Embedding 服务连接正常',
    model: settings.model || 'text-embedding-3-small',
    dimensions: response.data[0].embedding.length,
    latencyMs: Date.now() - startedAt,
  }
}

export async function assertAIConfigured(projectId: string) {
  const settings = await getEffectiveAISettings(projectId)
  if (!settings.apiKey) {
    throw new AIConfigurationError('AI 服务未配置，请先到项目设置完成配置检测')
  }
  return settings
}

function cleanJSONString(str: string): string {
  let cleaned = str.trim()
  const match = cleaned.match(/^```(?:json)?\n?([\s\S]*?)\n?```$/i)
  if (match) {
    cleaned = match[1].trim()
  }
  return cleaned
}

export async function callAIJSON<T = Record<string, unknown>>(
  messages: ChatCompletionMessageParam[],
  options: {
    model?: string
    temperature?: number
    responseFormat?: { type: 'json_object' }
    maxRetries?: number
    metadata: AIMetadata
  },
): Promise<T> {
  const projectId = options.metadata?.projectId
  if (!projectId)
    throw new AIProjectScopeError()
  if (isFakeAIEnabled())
    return fakeAIJSON(options.metadata.taskType || 'unknown') as T
  const settings = await assertAIConfigured(projectId)
  const client = createOpenAIClient(settings)
  const maxRetries = options.maxRetries ?? 2
  const model = options.model || settings.model
  const taskType = options.metadata.taskType || 'unknown'
  const startedAt = Date.now()
  let lastError: unknown

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await client.chat.completions.create({
        model,
        messages,
        temperature: (options.temperature ?? settings.temperature) / 100,
        response_format: options.responseFormat || { type: 'json_object' },
      })

      const latencyMs = Date.now() - startedAt
      const usage = response.usage

      if (options.metadata.projectId) {
        await AIUsageService.recordUsage({
          projectId,
          chapterId: options.metadata.chapterId,
          contextSnapshotId: options.metadata.contextSnapshotId,
          provider: settings.provider,
          model,
          taskType,
          promptTokens: usage?.prompt_tokens || 0,
          completionTokens: usage?.completion_tokens || 0,
          totalTokens: usage?.total_tokens || 0,
          latencyMs,
          status: 'success',
        })
      }

      const content = response.choices[0]?.message?.content
      if (!content)
        throw new AIError('AI 返回内容为空', 'EMPTY_RESPONSE')

      const cleanedContent = cleanJSONString(content)
      try {
        return JSON.parse(cleanedContent) as T
      }
      catch (error: unknown) {
        throw new AIParseError(`AI 返回的 JSON 无法解析: ${errorMessage(error)}`, content)
      }
    }
    catch (error: unknown) {
      lastError = error
      // Don't retry configuration or parse errors (unless we think retrying helps with parse)
      if (error instanceof AIConfigurationError)
        throw error

      if (attempt < maxRetries) {
        const delay = 2 ** attempt * 1000
        console.warn(`AI call failed, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries}):`, errorMessage(error))
        await sleep(delay)
      }
      else if (options.metadata.projectId) {
        await AIUsageService.recordUsage({
          projectId,
          chapterId: options.metadata.chapterId,
          contextSnapshotId: options.metadata.contextSnapshotId,
          provider: settings.provider,
          model,
          taskType,
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
          latencyMs: Date.now() - startedAt,
          status: 'error',
          errorCode: String(errorField(error, 'code') || errorField(error, 'name') || 'UNKNOWN'),
        })
      }
    }
  }

  throw lastError || new AIError('AI 请求失败', 'UNKNOWN_ERROR')
}

export async function* streamChat(
  messages: ChatCompletionMessageParam[],
  options: {
    projectId: string
    context?: string
    model?: string
  },
) {
  if (!messages || !messages.length) {
    throw new Error('Messages are required')
  }

  const settings = await assertAIConfigured(options.projectId)
  const openai = createOpenAIClient(settings)

  const systemMessages: ChatCompletionMessageParam[] = [
    {
      role: 'system',
      content: '你是专业的长篇小说自动写作引擎。必须优先遵守项目上下文、故事设定、人物动机、章节目标、场景约束、伏笔台账、事实图谱和写作人格。输出必须可被系统自动检查、修复、结构化抽取与写回，不得复刻参考作品原文、专名、桥段或连续表达。',
    },
  ]
  if (options.context) {
    systemMessages.push({ role: 'system', content: `Context: ${options.context}` })
  }
  const response = await openai.chat.completions.create({
    model: options.model || settings.model,
    messages: [...systemMessages, ...messages],
    stream: true,
    temperature: settings.temperature / 100,
  })

  for await (const chunk of response) {
    const content = chunk.choices[0]?.delta?.content || ''
    if (content) {
      yield content
    }
  }
}
export async function callAIEmbedding(
  text: string,
  options: { projectId: string, model?: string },
): Promise<number[]> {
  if (isFakeAIEnabled())
    return fakeAIEmbedding()
  const settings = await getEffectiveAISettings(options.projectId)
  if (settings.embeddingEnabled === false) {
    throw new Error('当前项目已禁用向量化（Embedding）功能，请在设置中开启。')
  }

  const model = options.model || settings.embeddingModel || 'text-embedding-3-small'
  const client = createOpenAIClient({
    apiKey: settings.embeddingApiKey || settings.apiKey,
    baseUrl: settings.embeddingBaseUrl || settings.baseUrl,
  })

  try {
    const response = await client.embeddings.create({
      model,
      input: text,
    })
    return response.data[0].embedding
  }
  catch (error: unknown) {
    if (errorField(error, 'status') === 404 || errorMessage(error).includes('model_not_found')) {
      throw new Error(`当前 AI 提供商或模型 (${model}) 不支持向量嵌入接口，请在设置中检查配置。`)
    }
    throw error
  }
}
