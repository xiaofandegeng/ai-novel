import { apiGet, apiPost } from './client'

export interface PromptTemplate {
  id: string
  key: string
  name: string
  description: string | null
  version: string
  systemPrompt: string | null
  userPromptTemplate: string | null
  outputSchema: any | null
}

export interface PromptOverride {
  id: string
  projectId: string
  templateKey: string
  overrideSystemPrompt: string | null
  overrideUserPromptTemplate: string | null
  enabled: number
}

export const promptTemplateApi = {
  listTemplates: () => apiGet<PromptTemplate[]>('/api/prompt-templates'),

  getOverrides: (projectId: string) => apiGet<PromptOverride[]>(`/api/projects/${projectId}/prompt-overrides`),

  saveOverride: (projectId: string, data: Partial<PromptOverride>) =>
    apiPost<{ id: string }>(`/api/projects/${projectId}/prompt-overrides`, data),

  testTemplate: (projectId: string, key: string, variables: Record<string, any>) =>
    apiPost<{ system: string, user: string }>(`/api/projects/${projectId}/prompt-templates/${key}/test`, variables),
}
