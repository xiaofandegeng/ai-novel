import type {
  AIEmbeddingTestResult,
  AIProviderPreset,
  AIProviderSettings,
  AIProviderTestResult,
  UpdateAIProviderSettingsInput,
} from '@ai-novel/shared'
import { apiGet, apiPost, apiPut } from './client'

export function fetchAISettings() {
  return apiGet<AIProviderSettings>('/api/settings/ai')
}

export function fetchAIProviderPresets() {
  return apiGet<AIProviderPreset[]>('/api/settings/ai/providers')
}

export function updateAISettings(data: UpdateAIProviderSettingsInput) {
  return apiPut<AIProviderSettings>('/api/settings/ai', data)
}

export function testAISettings(data: UpdateAIProviderSettingsInput) {
  return apiPost<AIProviderTestResult>('/api/settings/ai/test', data)
}

export function testEmbeddingSettings(data: UpdateAIProviderSettingsInput) {
  return apiPost<AIEmbeddingTestResult>('/api/settings/ai/test-embedding', data)
}
