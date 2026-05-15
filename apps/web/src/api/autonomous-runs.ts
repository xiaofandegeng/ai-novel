import type { AutonomousWritingRun, CreateAutonomousRunInput } from '@ai-novel/shared'
import { apiGet, apiPost } from './client'

export async function fetchAutonomousRun(projectId: string, runId: string): Promise<AutonomousWritingRun & { jobs: any[] }> {
  return apiGet<AutonomousWritingRun & { jobs: any[] }>(`/api/projects/${projectId}/autonomous-runs/${runId}`)
}

export async function fetchActiveAutonomousRun(projectId: string): Promise<(AutonomousWritingRun & { jobs: any[] }) | null> {
  return apiGet<(AutonomousWritingRun & { jobs: any[] }) | null>(`/api/projects/${projectId}/autonomous-runs/active`)
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

export async function fetchAutonomousExceptions(projectId: string, runId: string): Promise<any[]> {
  return apiGet<any[]>(`/api/projects/${projectId}/autonomous-runs/${runId}/exceptions`)
}

export async function resolveAutonomousException(projectId: string, runId: string, exceptionId: string, resolution: string): Promise<void> {
  return apiPost<void>(`/api/projects/${projectId}/autonomous-runs/${runId}/exceptions/${exceptionId}/resolve`, { resolution })
}

export async function ignoreAutonomousException(projectId: string, runId: string, exceptionId: string): Promise<void> {
  return apiPost<void>(`/api/projects/${projectId}/autonomous-runs/${runId}/exceptions/${exceptionId}/ignore`, {})
}
