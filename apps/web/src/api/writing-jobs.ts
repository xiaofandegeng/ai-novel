import type { CreateWritingJobInput, WritingJob } from '@ai-novel/shared'
import { apiDel, apiGet, apiPost } from './client'

export function fetchWritingJob(projectId: string) {
  return apiGet<WritingJob | null>(`/api/projects/${projectId}/writing-job`)
}

export function createWritingJob(projectId: string, data: CreateWritingJobInput) {
  return apiPost<WritingJob>(`/api/projects/${projectId}/writing-job`, data)
}

export function startWritingJob(projectId: string, id: string) {
  return apiPost<WritingJob>(`/api/projects/${projectId}/writing-job/${id}/start`, {})
}

export function pauseWritingJob(projectId: string, id: string) {
  return apiPost<WritingJob>(`/api/projects/${projectId}/writing-job/${id}/pause`, {})
}

export function continueWritingJob(projectId: string, id: string) {
  return apiPost<WritingJob>(`/api/projects/${projectId}/writing-job/${id}/continue`, {})
}

export function deleteWritingJob(projectId: string, id: string) {
  return apiDel(`/api/projects/${projectId}/writing-job/${id}`)
}
