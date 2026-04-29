import type { AnalyzeSourceInput, CreateKnowledgeNoteInput, CreateKnowledgeSourceInput, KnowledgeChunk, KnowledgeNote, KnowledgeSource, KnowledgeSourceDetail } from '@ai-novel/shared'
import { apiGet, apiPost } from './client'

export function fetchSources(projectId: string) {
  return apiGet<KnowledgeSource[]>(`/api/projects/${projectId}/knowledge/sources`)
}

export function createSource(projectId: string, data: CreateKnowledgeSourceInput) {
  return apiPost<KnowledgeSource>(`/api/projects/${projectId}/knowledge/sources`, data)
}

export function getSourceDetail(projectId: string, sourceId: string) {
  return apiGet<KnowledgeSourceDetail>(`/api/projects/${projectId}/knowledge/sources/${sourceId}`)
}

export function analyzeSource(projectId: string, sourceId: string, data: AnalyzeSourceInput) {
  return apiPost<{ chunks: number }>(`/api/projects/${projectId}/knowledge/sources/${sourceId}/analyze`, data)
}

export function searchKnowledge(projectId: string, query: string) {
  return apiGet<KnowledgeChunk[]>(`/api/projects/${projectId}/knowledge/search?q=${encodeURIComponent(query)}`)
}

export function fetchNotes(projectId: string) {
  return apiGet<KnowledgeNote[]>(`/api/projects/${projectId}/knowledge/notes`)
}

export function createNote(projectId: string, data: CreateKnowledgeNoteInput) {
  return apiPost<KnowledgeNote>(`/api/projects/${projectId}/knowledge/notes`, data)
}
