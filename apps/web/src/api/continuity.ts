import type { ContinuityIssue, ContinuityReport } from '@ai-novel/shared'
import { apiPost } from './client'

export type { ContinuityIssue, ContinuityReport }

export function analyzeContinuity(projectId: string) {
  return apiPost<ContinuityReport>(`/api/projects/${projectId}/continuity/analyze`, {})
}
