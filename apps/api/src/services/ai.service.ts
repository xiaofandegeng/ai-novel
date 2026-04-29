import type { UpdateAIProviderSettingsInput } from '@ai-novel/shared'
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions'
import process from 'node:process'
import { eq } from 'drizzle-orm'
import OpenAI from 'openai'
import { db } from '../db'
import { aiSettings } from '../db/schema'
import { now } from '../utils'

const GLOBAL_AI_SETTINGS_ID = 'global'

interface EffectiveAISettings {
  provider: string
  baseUrl: string
  model: string
  apiKey?: string | null
  temperature: number
  updatedAt?: string
}

function defaultAISettings(): EffectiveAISettings {
  return {
    provider: process.env.AI_PROVIDER || 'openai-compatible',
    baseUrl: process.env.AI_BASE_URL || 'https://api.openai.com/v1',
    model: process.env.AI_MODEL || 'gpt-4o-mini',
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

export async function updateAISettings(input: UpdateAIProviderSettingsInput) {
  const current = await getEffectiveAISettings()
  const timestamp = now()
  const next = {
    id: GLOBAL_AI_SETTINGS_ID,
    provider: input.provider?.trim() || current.provider,
    baseUrl: input.baseUrl?.trim() || current.baseUrl,
    model: input.model?.trim() || current.model,
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
  const settings: EffectiveAISettings = {
    ...saved,
    provider: input?.provider?.trim() || saved.provider,
    baseUrl: input?.baseUrl?.trim() || saved.baseUrl,
    model: input?.model?.trim() || saved.model,
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

export async function* streamChat(
  messages: ChatCompletionMessageParam[],
  context?: string,
  model?: string,
) {
  if (!messages || !messages.length) {
    throw new Error('Messages are required')
  }

  const settings = await getEffectiveAISettings()
  const openai = createOpenAIClient(settings)

  const systemMessages: ChatCompletionMessageParam[] = [
    {
      role: 'system',
      content: 'You are an expert novelist and creative writing assistant. Help the author expand their world, brainstorm character motivations, or draft scenes based on the provided context.',
    },
  ]
  if (context) {
    systemMessages.push({ role: 'system', content: `Context: ${context}` })
  }

  const response = await openai.chat.completions.create({
    model: model || settings.model,
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
