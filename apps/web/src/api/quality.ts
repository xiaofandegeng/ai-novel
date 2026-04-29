import type { QualityReport, RunQualityCheckInput } from '@ai-novel/shared'
import { apiGet, apiPost } from './client'

export function fetchReports(projectId: string) {
  return apiGet<QualityReport[]>(`/api/projects/${projectId}/quality/reports`)
}

export function runQualityCheck(projectId: string, chapterId: string, data?: RunQualityCheckInput) {
  return apiPost<QualityReport>(`/api/projects/${projectId}/chapters/${chapterId}/quality-check`, data ?? {})
}

export function getReport(projectId: string, reportId: string) {
  return apiGet<QualityReport>(`/api/projects/${projectId}/quality/reports/${reportId}`)
}
