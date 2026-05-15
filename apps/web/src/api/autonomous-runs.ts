import type { AutonomousWritingRun, CreateAutonomousRunInput } from '@ai-novel/shared'
import { apiGet, apiPost } from './client'

export async function fetchAutonomousRun(projectId: string, runId: string): Promise<AutonomousWritingRun & { jobs: any[] }> {
  return apiGet<AutonomousWritingRun & { jobs: any[] }>(`/api/projects/${projectId}/autonomous-runs/${runId}`)
}

export async function createAutonomousRun(projectId: string, input: CreateAutonomousRunInput): Promise<AutonomousWritingRun> {
  return apiPost<AutonomousWritingRun>(`/api/projects/${projectId}/autonomous-runs`, input)
}

export async function startAutonomousRun(projectId: string, runId: string): Promise<void> {
  return apiPost<void>(`/api/projects/${projectId}/autonomous-runs/${runId}/start`, {})
}

export async function pauseAutonomousRun(projectId: string, runId: string, reason?: string): Promise<void> {
  return apiPost<void>(`/api/projects/${projectId}/autonomous-runs/${runId}/pause`, { reason })
}

export async function resumeAutonomousRun(projectId: string, runId: string): Promise<void> {
  return apiPost<void>(`/api/projects/${projectId}/autonomous-runs/${runId}/resume`, {})
}
