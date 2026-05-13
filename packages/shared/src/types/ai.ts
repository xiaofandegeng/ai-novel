import type { AIScene } from './ai-context'

export interface AIMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export type AIProviderId
  = 'openai'
    | 'kimi'
    | 'zhipu-glm'
    | 'gemini'
    | 'volcengine-ark'
    | 'openai-compatible'

export interface AIProviderModelPreset {
  label: string
  value: string
}

export interface AIProviderPreset {
  id: AIProviderId
  label: string
  description: string
  baseUrl: string
  defaultModel: string
  apiKeyHint: string
  models: AIProviderModelPreset[]
  requiresCustomModel?: boolean
}

export const AI_PROVIDER_PRESETS: AIProviderPreset[] = [
  {
    id: 'openai',
    label: 'OpenAI / GPT',
    description: 'OpenAI 官方接口，适合通用创作、润色和结构分析。',
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
    apiKeyHint: '使用 OpenAI API Key。',
    models: [
      { label: 'GPT-4o Mini', value: 'gpt-4o-mini' },
      { label: 'GPT-4o', value: 'gpt-4o' },
      { label: 'GPT-4.1 Mini', value: 'gpt-4.1-mini' },
      { label: 'GPT-4.1', value: 'gpt-4.1' },
    ],
  },
  {
    id: 'kimi',
    label: 'Kimi / Moonshot',
    description: 'Moonshot OpenAI 兼容接口，适合长文本理解和中文创作。',
    baseUrl: 'https://api.moonshot.cn/v1',
    defaultModel: 'kimi-latest',
    apiKeyHint: '使用 Moonshot / Kimi API Key。',
    models: [
      { label: 'Kimi Latest', value: 'kimi-latest' },
      { label: 'Moonshot v1 8K', value: 'moonshot-v1-8k' },
      { label: 'Moonshot v1 32K', value: 'moonshot-v1-32k' },
      { label: 'Moonshot v1 128K', value: 'moonshot-v1-128k' },
    ],
  },
  {
    id: 'zhipu-glm',
    label: '智谱 GLM',
    description: '智谱 OpenAI 兼容接口，可用于 GLM 系列模型。',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    defaultModel: 'glm-5.1',
    apiKeyHint: '使用智谱 API Key。模型名可按控制台实际开通情况调整。',
    models: [
      { label: 'GLM 5.1', value: 'glm-5.1' },
      { label: 'GLM 4.5', value: 'glm-4.5' },
      { label: 'GLM 4 Plus', value: 'glm-4-plus' },
      { label: 'GLM 4 Flash', value: 'glm-4-flash' },
    ],
  },
  {
    id: 'gemini',
    label: 'Google Gemini',
    description: 'Gemini OpenAI 兼容接口，适合创意发散、总结和多轮分析。',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    defaultModel: 'gemini-2.5-flash',
    apiKeyHint: '使用 Google AI Studio / Gemini API Key。',
    models: [
      { label: 'Gemini 2.5 Flash', value: 'gemini-2.5-flash' },
      { label: 'Gemini 2.5 Pro', value: 'gemini-2.5-pro' },
      { label: 'Gemini 1.5 Flash', value: 'gemini-1.5-flash' },
      { label: 'Gemini 1.5 Pro', value: 'gemini-1.5-pro' },
    ],
  },
  {
    id: 'volcengine-ark',
    label: '火山引擎方舟',
    description: '火山方舟 OpenAI 兼容接口，模型名通常是方舟控制台里的 endpoint id。',
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    defaultModel: '请填写方舟 endpoint id',
    apiKeyHint: '使用火山引擎方舟 API Key。模型名请填写控制台 endpoint id。',
    models: [
      { label: '自定义 Endpoint ID', value: '请填写方舟 endpoint id' },
      { label: 'Doubao Seed 1.6', value: 'doubao-seed-1-6' },
      { label: 'Doubao 1.5 Pro', value: 'doubao-1-5-pro' },
      { label: 'Doubao 1.5 Lite', value: 'doubao-1-5-lite' },
    ],
    requiresCustomModel: true,
  },
  {
    id: 'openai-compatible',
    label: '自定义 OpenAI 兼容源',
    description: '用于 DeepSeek、OpenRouter、本地网关、私有代理等 OpenAI 兼容接口。',
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
    apiKeyHint: '填写对应平台的 API Key。',
    models: [
      { label: '自定义模型', value: 'custom-model' },
      { label: 'DeepSeek Chat', value: 'deepseek-chat' },
      { label: 'Qwen Max', value: 'qwen-max' },
      { label: 'Claude 兼容模型', value: 'claude-3-5-sonnet' },
    ],
    requiresCustomModel: true,
  },
]

export interface AIChatRequest {
  messages: AIMessage[]
  context?: string
  model?: string
}

export interface AIResultProposal {
  id: string
  type: 'outline' | 'draft' | 'suggestion'
  content: string
  createdAt: string
}

export interface AIProviderSettings {
  provider: string
  baseUrl: string
  model: string
  temperature: number
  hasApiKey: boolean
  updatedAt?: string
}

export interface UpdateAIProviderSettingsInput {
  provider?: string
  baseUrl?: string
  model?: string
  temperature?: number
  apiKey?: string
  clearApiKey?: boolean
}

export interface AIProviderTestResult {
  ok: boolean
  message: string
  model?: string
  latencyMs?: number
}

export interface ChatStreamOptions {
  projectId?: string
  context?: string
  model?: string
  scene?: AIScene
}

export interface GenerateAIOptions {
  projectId: string
  scene: AIScene
  chapterId?: string
  volumeId?: string
  sceneId?: string
  selectedText?: string
  userInstruction?: string
  model?: string
}
