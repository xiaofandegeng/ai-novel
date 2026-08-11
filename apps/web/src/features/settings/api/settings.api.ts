import type {
  AIEmbeddingTestResult,
  AIProviderPreset,
  AIProviderSettings,
  AIProviderTestResult,
  UpdateAIProviderSettingsInput,
} from '@ai-novel/shared'
import { apiGet, apiPost, apiPut } from '../../../shared/api/client'

export function fetchAISettings(projectId: string) {
  return apiGet<AIProviderSettings>(`/api/projects/${projectId}/settings/ai`)
}

export function fetchAIProviderPresets() {
  return apiGet<AIProviderPreset[]>('/api/settings/ai/providers')
}

export function updateAISettings(projectId: string, data: UpdateAIProviderSettingsInput) {
  return apiPut<AIProviderSettings>(`/api/projects/${projectId}/settings/ai`, data)
}

export function testAISettings(projectId: string, data: UpdateAIProviderSettingsInput) {
  return apiPost<AIProviderTestResult>(`/api/projects/${projectId}/settings/ai/test`, data)
}

export function testEmbeddingSettings(projectId: string, data: UpdateAIProviderSettingsInput) {
  return apiPost<AIEmbeddingTestResult>(`/api/projects/${projectId}/settings/ai/test-embedding`, data)
}
