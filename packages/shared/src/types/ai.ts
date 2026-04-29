export interface AIMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

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
