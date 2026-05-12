import type { AIProviderId, UpdateAIProviderSettingsInput } from '@ai-novel/shared'
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions'
import process from 'node:process'
import { AI_PROVIDER_PRESETS } from '@ai-novel/shared'
import { eq } from 'drizzle-orm'
import OpenAI from 'openai'
import { db } from '../db'
import { aiSettings } from '../db/schema'
import { now } from '../utils'

const GLOBAL_AI_SETTINGS_ID = 'global'

interface EffectiveAISettings {
  provider: AIProviderId | string
  baseUrl: string
  model: string
  apiKey?: string | null
  temperature: number
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
  }
}

export function sanitizeAISettings(settings: EffectiveAISettings) {
  return {
    provider: settings.provider,
    baseUrl: settings.baseUrl,
    model: settings.model,
    temperature: settings.temperature,
    hasApiKey: Boolean(settings.apiKey),
    updatedAt: settings.updatedAt,
  }
}

export async function getEffectiveAISettings(): Promise<EffectiveAISettings> {
  const fallback = defaultAISettings()
  const [saved] = await db.select().from(aiSettings).where(eq(aiSettings.id, GLOBAL_AI_SETTINGS_ID))

  if (!saved)
    return fallback

  return {
    provider: saved.provider || fallback.provider,
    baseUrl: saved.baseUrl || fallback.baseUrl,
    model: saved.model || fallback.model,
    apiKey: saved.apiKey || fallback.apiKey,
    temperature: saved.temperature ?? fallback.temperature,
    updatedAt: saved.updatedAt,
  }
}

export async function getAISettings() {
  return sanitizeAISettings(await getEffectiveAISettings())
}

export function listAIProviderPresets() {
  return AI_PROVIDER_PRESETS
}

function normalizeAISettingsInput(input: UpdateAIProviderSettingsInput, current: EffectiveAISettings) {
  const provider = input.provider?.trim() || current.provider
  const preset = AI_PROVIDER_PRESETS.find(p => p.id === provider)
  const baseUrl = input.baseUrl?.trim() || preset?.baseUrl || current.baseUrl
  const model = input.model?.trim() || preset?.defaultModel || current.model

  return { provider, baseUrl, model }
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
        updatedAt: timestamp,
      },
    })
    .returning()

  return sanitizeAISettings(row)
}

export function createOpenAIClient(settings: EffectiveAISettings) {
  return new OpenAI({
    apiKey: settings.apiKey || 'missing-key',
    baseURL: settings.baseUrl,
  })
}

export async function testAIConnection(input?: UpdateAIProviderSettingsInput) {
  const saved = await getEffectiveAISettings()
  const normalized = input ? normalizeAISettingsInput(input, saved) : saved
  const settings: EffectiveAISettings = {
    ...saved,
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

export async function assertAIConfigured() {
  const settings = await getEffectiveAISettings()
  if (!settings.apiKey) {
    throw new Error('AI 服务未配置，请先到项目设置完成配置检测')
  }
  return settings
}

export async function callAIJSON<T = Record<string, unknown>>(
  messages: ChatCompletionMessageParam[],
  options?: {
    model?: string
    temperature?: number
    responseFormat?: { type: 'json_object' }
  },
): Promise<T> {
  const settings = await assertAIConfigured()
  const client = createOpenAIClient(settings)
  const response = await client.chat.completions.create({
    model: options?.model || settings.model,
    messages,
    temperature: (options?.temperature ?? settings.temperature) / 100,
    response_format: options?.responseFormat || { type: 'json_object' },
  })
  const content = response.choices[0]?.message?.content
  if (!content)
    throw new Error('AI 返回内容为空')
  try {
    return JSON.parse(content) as T
  }
  catch {
    throw new Error('AI 返回的 JSON 无法解析')
  }
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
      content: '你是专业的长篇小说创作协作者。必须优先遵守项目上下文、故事设定、人物动机、章节目标、场景约束、伏笔台账、事实图谱和写作人格。你只能输出可供作者确认的创作建议或正文草稿，不得绕过作者决策，不得复刻参考作品原文、专名、桥段或连续表达。',
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
