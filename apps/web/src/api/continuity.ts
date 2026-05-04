import { apiPost } from './client'

export interface ContinuityIssue {
  type: string
  severity: 'low' | 'medium' | 'high'
  description: string
  evidence: string[]
  suggestion: string
}

export interface ContinuityReport {
  issues: ContinuityIssue[]
  chapterCount: number
  analyzedAt: string
}

export function analyzeContinuity(projectId: string) {
  return apiPost<ContinuityReport>(`/api/projects/${projectId}/continuity/analyze`, {})
}
