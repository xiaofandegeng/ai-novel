import type { CreateWritingJobInput, WritingJob, WritingJobStep } from '@ai-novel/shared'
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

export function fetchJobSteps(projectId: string, jobId: string) {
  return apiGet<WritingJobStep[]>(`/api/projects/${projectId}/writing-job/${jobId}/steps`)
}

export function approveStep(projectId: string, jobId: string, stepId: string) {
  return apiPost<{ job: WritingJob, steps: WritingJobStep[] }>(`/api/projects/${projectId}/writing-job/${jobId}/steps/${stepId}/approve`, {})
}

export function rejectStep(projectId: string, jobId: string, stepId: string, reason?: string) {
  return apiPost<{ job: WritingJob, steps: WritingJobStep[] }>(`/api/projects/${projectId}/writing-job/${jobId}/steps/${stepId}/reject`, { reason })
}

export function retryStep(projectId: string, jobId: string, stepId: string) {
  return apiPost<{ job: WritingJob, steps: WritingJobStep[] }>(`/api/projects/${projectId}/writing-job/${jobId}/retry`, { stepId })
}
