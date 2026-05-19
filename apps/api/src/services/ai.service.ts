import type { AIProviderId, UpdateAIProviderSettingsInput } from '@ai-novel/shared'
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions'
import process from 'node:process'
import { AI_PROVIDER_PRESETS } from '@ai-novel/shared'
import { eq } from 'drizzle-orm'
import OpenAI from 'openai'
import { db } from '../db'
import { aiSettings } from '../db/schema'
import { now } from '../utils'
import { AIUsageService } from './ai-usage.service'

interface AIMetadata {
  projectId?: string
  chapterId?: string
  contextSnapshotId?: string
  taskType?: string
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

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

const GLOBAL_AI_SETTINGS_ID = 'global'

interface EffectiveAISettings {
  provider: AIProviderId | string
  baseUrl: string
  model: string
  apiKey?: string | null
  temperature: number

  embeddingProvider?: string
  embeddingBaseUrl?: string
  embeddingModel?: string
  embeddingApiKey?: string | null
  embeddingEnabled?: boolean

  updatedAt?: string
}

function defaultAISettings(): EffectiveAISettings {
  const fallbackPreset = AI_PROVIDER_PRESETS.find(p => p.id === 'openai') || AI_PROVIDER_PRESETS[0]
  return {
    provider: process.env.AI_PROVIDER || fallbackPreset.id,
    baseUrl: process.env.AI_BASE_URL || fallbackPreset.baseUrl,
    model: process.env.AI_MODEL || fallbackPreset.defaultModel,
    apiKey: process.env.AI_API_KEY,
    temperature: Number(process.env.AI_TEMPERATURE || 70),

    embeddingProvider: process.env.AI_EMBEDDING_PROVIDER || fallbackPreset.id,
    embeddingBaseUrl: process.env.AI_EMBEDDING_BASE_URL || fallbackPreset.baseUrl,
    embeddingModel: process.env.AI_EMBEDDING_MODEL || fallbackPreset.defaultEmbeddingModel || 'text-embedding-3-small',
    embeddingApiKey: process.env.AI_EMBEDDING_API_KEY || process.env.AI_API_KEY,
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

export async function getEffectiveAISettings(): Promise<EffectiveAISettings> {
  const fallback = defaultAISettings()
  const [saved] = await db.select().from(aiSettings).where(eq(aiSettings.id, GLOBAL_AI_SETTINGS_ID))

  if (!saved)
    return fallback

  const provider = saved.provider || fallback.provider
  const model = saved.model || fallback.model
  const embeddingProvider = saved.embeddingProvider || fallback.embeddingProvider

  return {
    provider,
    baseUrl: saved.baseUrl || fallback.baseUrl,
    model,
    apiKey: saved.apiKey || fallback.apiKey,
    temperature: saved.temperature ?? fallback.temperature,

    embeddingProvider,
    embeddingBaseUrl: saved.embeddingBaseUrl || fallback.embeddingBaseUrl,
    embeddingModel: normalizeEmbeddingModel({
      provider,
      model,
      embeddingProvider,
      embeddingModel: saved.embeddingModel || fallback.embeddingModel,
    }) || fallback.embeddingModel,
    embeddingApiKey: saved.embeddingApiKey || saved.apiKey || fallback.embeddingApiKey,
    embeddingEnabled: saved.embeddingEnabled ?? fallback.embeddingEnabled,

    updatedAt: saved.updatedAt ?? undefined,
  }
}

export async function getAISettings() {
  return sanitizeAISettings(await getEffectiveAISettings())
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

export async function updateAISettings(input: UpdateAIProviderSettingsInput) {
  const current = await getEffectiveAISettings()
  const timestamp = now()
  const normalized = normalizeAISettingsInput(input, current)
  const next = {
    id: GLOBAL_AI_SETTINGS_ID,
    provider: normalized.provider,
    baseUrl: normalized.baseUrl,
    model: normalized.model,
    apiKey: input.clearApiKey ? null : input.apiKey?.trim() || current.apiKey || null,
    temperature: typeof input.temperature === 'number'
      ? Math.min(100, Math.max(0, Math.round(input.temperature)))
      : current.temperature,

    embeddingProvider: normalized.embeddingProvider,
    embeddingBaseUrl: normalized.embeddingBaseUrl,
    embeddingModel: normalized.embeddingModel,
    embeddingApiKey: input.clearEmbeddingApiKey ? null : input.embeddingApiKey?.trim() || current.embeddingApiKey || null,
    embeddingEnabled: typeof input.embeddingEnabled === 'boolean' ? input.embeddingEnabled : current.embeddingEnabled,

    createdAt: timestamp,
    updatedAt: timestamp,
  }

  const [row] = await db
    .insert(aiSettings)
    .values(next)
    .onConflictDoUpdate({
      target: aiSettings.id,
      set: {
        provider: next.provider,
        baseUrl: next.baseUrl,
        model: next.model,
        apiKey: next.apiKey,
        temperature: next.temperature,
        embeddingProvider: next.embeddingProvider,
        embeddingBaseUrl: next.embeddingBaseUrl,
        embeddingModel: next.embeddingModel,
        embeddingApiKey: next.embeddingApiKey,
        embeddingEnabled: next.embeddingEnabled,
        updatedAt: timestamp,
      },
    })
    .returning()

  return sanitizeAISettings(row as unknown as EffectiveAISettings)
}

export function createOpenAIClient(settings: { apiKey?: string | null, baseUrl: string }) {
  return new OpenAI({
    apiKey: settings.apiKey || 'missing-key',
    baseURL: settings.baseUrl,
  })
}

export async function testAIConnection(input?: UpdateAIProviderSettingsInput) {
  const saved = await getEffectiveAISettings()
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

export async function testEmbeddingConnection(input?: UpdateAIProviderSettingsInput) {
  const saved = await getEffectiveAISettings()
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

export async function assertAIConfigured() {
  const settings = await getEffectiveAISettings()
  if (!settings.apiKey) {
    throw new AIConfigurationError('AI 服务未配置，请先到项目设置完成配置检测')
  }
  return settings
}

export async function callAIJSON<T = Record<string, unknown>>(
  messages: ChatCompletionMessageParam[],
  options?: {
    model?: string
    temperature?: number
    responseFormat?: { type: 'json_object' }
    maxRetries?: number
    metadata?: AIMetadata
  },
): Promise<T> {
  const settings = await assertAIConfigured()
  const client = createOpenAIClient(settings)
  const maxRetries = options?.maxRetries ?? 2
  const model = options?.model || settings.model
  const taskType = options?.metadata?.taskType || 'unknown'
  const startedAt = Date.now()
  let lastError: any

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await client.chat.completions.create({
        model,
        messages,
        temperature: (options?.temperature ?? settings.temperature) / 100,
        response_format: options?.responseFormat || { type: 'json_object' },
      })

      const latencyMs = Date.now() - startedAt
      const usage = response.usage

      if (options?.metadata?.projectId) {
        await AIUsageService.recordUsage({
          projectId: options.metadata.projectId,
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

      try {
        return JSON.parse(content) as T
      }
      catch (e: any) {
        throw new AIParseError(`AI 返回的 JSON 无法解析: ${e.message}`, content)
      }
    }
    catch (err: any) {
      lastError = err
      // Don't retry configuration or parse errors (unless we think retrying helps with parse)
      if (err instanceof AIConfigurationError)
        throw err

      if (attempt < maxRetries) {
        const delay = 2 ** attempt * 1000
        console.warn(`AI call failed, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries}):`, err.message)
        await sleep(delay)
      }
      else if (options?.metadata?.projectId) {
        await AIUsageService.recordUsage({
          projectId: options.metadata.projectId,
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
          errorCode: err.code || err.name || 'UNKNOWN',
        })
      }
    }
  }

  throw lastError || new AIError('AI 请求失败', 'UNKNOWN_ERROR')
}

export async function* streamChat(
  messages: ChatCompletionMessageParam[],
  options?: {
    context?: string
    model?: string
    personaPrompt?: string | null
  },
) {
  if (!messages || !messages.length) {
    throw new Error('Messages are required')
  }

  const settings = await assertAIConfigured()
  const openai = createOpenAIClient(settings)

  const systemMessages: ChatCompletionMessageParam[] = [
    {
      role: 'system',
      content: '你是专业的长篇小说自动写作引擎。必须优先遵守项目上下文、故事设定、人物动机、章节目标、场景约束、伏笔台账、事实图谱和写作人格。输出必须可被系统自动检查、修复、结构化抽取与写回，不得复刻参考作品原文、专名、桥段或连续表达。',
    },
  ]
  if (options?.context) {
    systemMessages.push({ role: 'system', content: `Context: ${options.context}` })
  }
  if (options?.personaPrompt) {
    systemMessages.push({ role: 'system', content: `写作人格约束：\n${options.personaPrompt}` })
  }

  const response = await openai.chat.completions.create({
    model: options?.model || settings.model,
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
export async function callAIEmbedding(text: string, options?: { model?: string }): Promise<number[]> {
  const settings = await getEffectiveAISettings()
  if (settings.embeddingEnabled === false) {
    throw new Error('当前项目已禁用向量化（Embedding）功能，请在设置中开启。')
  }

  const model = options?.model || settings.embeddingModel || 'text-embedding-3-small'
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
  catch (err: any) {
    if (err?.status === 404 || err?.message?.includes('model_not_found')) {
      throw new Error(`当前 AI 提供商或模型 (${model}) 不支持向量嵌入接口，请在设置中检查配置。`)
    }
    throw err
  }
}
