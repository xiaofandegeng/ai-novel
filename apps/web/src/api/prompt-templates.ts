import { client } from './client'

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
  listTemplates: () => client.get<PromptTemplate[]>('/prompt-templates'),

  getOverrides: (projectId: string) => client.get<PromptOverride[]>(`/projects/${projectId}/prompt-overrides`),

  saveOverride: (projectId: string, data: Partial<PromptOverride>) =>
    client.post<{ id: string }>(`/projects/${projectId}/prompt-overrides`, data),

  testTemplate: (projectId: string, key: string, variables: Record<string, any>) =>
    client.post<{ system: string, user: string }>(`/projects/${projectId}/prompt-templates/${key}/test`, variables),
}
