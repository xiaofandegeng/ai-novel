import type {
  ChapterAnalysis,
  CreatePersonaInput,
  CreateReferenceWorkInput,
  CreateTrainingSetInput,
  DriftCheckResult,
  ProjectPersonaConfig,
  ReferenceChapter,
  ReferenceChapterAnalysisError,
  ReferenceTrainingSet,
  ReferenceWork,
  UpdateProjectPersonaConfigInput,
  WorkAnalysisSummary,
  WorkStyleReport,
  WritingPersona,
} from '@ai-novel/shared'
import { apiDel, apiGet, apiPatch, apiPost, apiPut } from './client'

// ─── Training Sets ───

export function listTrainingSets() {
  return apiGet<ReferenceTrainingSet[]>('/api/persona/training-sets')
}

export function createTrainingSet(data: CreateTrainingSetInput) {
  return apiPost<ReferenceTrainingSet>('/api/persona/training-sets', data)
}

export function getTrainingSet(id: string) {
  return apiGet<ReferenceTrainingSet>(`/api/persona/training-sets/${id}`)
}

export function updateTrainingSet(id: string, data: Partial<ReferenceTrainingSet>) {
  return apiPatch<ReferenceTrainingSet>(`/api/persona/training-sets/${id}`, data)
}

export function deleteTrainingSet(id: string) {
  return apiDel(`/api/persona/training-sets/${id}`)
}

// ─── Reference Works ───

export function listWorks(trainingSetId: string) {
  return apiGet<ReferenceWork[]>(`/api/persona/training-sets/${trainingSetId}/works`)
}

export function createWork(trainingSetId: string, data: CreateReferenceWorkInput) {
  return apiPost<ReferenceWork>(`/api/persona/training-sets/${trainingSetId}/works`, data)
}

export function getWork(workId: string) {
  return apiGet<ReferenceWork>(`/api/persona/works/${workId}`)
}

export function deleteWork(workId: string) {
  return apiDel(`/api/persona/works/${workId}`)
}

export function splitWork(workId: string, content: string) {
  return apiPost<{ chunks: number }>(`/api/persona/works/${workId}/split`, { content })
}

// ─── Chapter Analysis ───

export function listWorkChapters(workId: string) {
  return apiGet<ReferenceChapter[]>(`/api/persona/works/${workId}/chapters`)
}

export function getChapterAnalysis(chapterId: string) {
  return apiGet<ChapterAnalysis>(`/api/persona/chapters/${chapterId}/analysis`)
}

export function analyzeWork(workId: string) {
  return apiPost<{ analyzed: number, errors: string[], chapters: number }>(`/api/persona/works/${workId}/analyze`, {})
}

export function listWorkAnalysisErrors(workId: string) {
  return apiGet<ReferenceChapterAnalysisError[]>(`/api/persona/works/${workId}/analysis-errors`)
}

export function retryFailedAnalyses(workId: string) {
  return apiPost<{ analyzed: number, failed: number, errors: string[], chapters: number, status: string }>(
    `/api/persona/works/${workId}/retry-failed-analyses`,
    {},
  )
}

// ─── Work Style Report ───

export function getWorkStyleReport(workId: string) {
  return apiGet<WorkStyleReport>(`/api/persona/works/${workId}/style-report`)
}

export function generateWorkStyleReport(workId: string) {
  return apiPost<WorkStyleReport>(`/api/persona/works/${workId}/style-report`, {})
}

// ─── Writing Personas ───

export function listPersonas() {
  return apiGet<WritingPersona[]>('/api/personas')
}

export function listPublishedPersonas() {
  return apiGet<WritingPersona[]>('/api/personas/published')
}

export function createPersona(data: CreatePersonaInput) {
  return apiPost<WritingPersona>('/api/personas', data)
}

export function getPersona(personaId: string) {
  return apiGet<WritingPersona>(`/api/personas/${personaId}`)
}

export function updatePersona(personaId: string, data: Partial<WritingPersona>) {
  return apiPatch<WritingPersona>(`/api/personas/${personaId}`, data)
}

export function deletePersona(personaId: string) {
  return apiDel(`/api/personas/${personaId}`)
}

export function generatePersonaFromTrainingSet(trainingSetId: string, data: CreatePersonaInput) {
  return apiPost<WritingPersona>(`/api/persona/training-sets/${trainingSetId}/generate-persona`, data)
}

export function publishPersona(personaId: string) {
  return apiPost<WritingPersona>(`/api/personas/${personaId}/publish`, {})
}

// ─── Project Persona Config ───

export function getProjectPersonaConfig(projectId: string) {
  return apiGet<ProjectPersonaConfig | null>(`/api/projects/${projectId}/persona-config`)
}

export function updateProjectPersonaConfig(projectId: string, data: UpdateProjectPersonaConfigInput) {
  return apiPut<ProjectPersonaConfig>(`/api/projects/${projectId}/persona-config`, data)
}

export function getPersonaPreview(projectId: string) {
  return apiPost<{ strength: number, injectionPrompt: string, personaName: string } | null>(`/api/projects/${projectId}/persona-preview`, {})
}

export type { DriftCheckResult }

export function checkPersonaDrift(projectId: string, content: string) {
  return apiPost<DriftCheckResult>(`/api/projects/${projectId}/persona-drift-check`, { content })
}

// ─── Work Analysis Summary ───

export type { WorkAnalysisSummary }

export function getWorkAnalysisSummary(workId: string) {
  return apiGet<WorkAnalysisSummary>(`/api/persona/works/${workId}/analysis-summary`)
}
