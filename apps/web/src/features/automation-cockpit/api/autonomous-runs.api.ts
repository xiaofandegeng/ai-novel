import type { AutonomousExceptionAction, AutonomousWritingRun, CreateAutonomousRunInput } from '@ai-novel/shared'
import { apiPost } from '../../../shared/api/client'

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

export async function abandonAutonomousRun(projectId: string, runId: string): Promise<void> {
  return apiPost<void>(`/api/projects/${projectId}/autonomous-runs/${runId}/abandon`, {})
}

export async function resolveAutonomousException(
  projectId: string,
  runId: string,
  exceptionId: string,
  action: AutonomousExceptionAction,
): Promise<void> {
  return apiPost<void>(`/api/projects/${projectId}/autonomous-runs/${runId}/exceptions/${exceptionId}/actions`, { action })
}
