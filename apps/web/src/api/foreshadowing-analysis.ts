import { apiGet, apiPost } from './client'

export interface ForeshadowingRisk {
  id: string
  title: string
  status: string
  importance: string
  setupChapterId: string | null
  setupChapterNumber: number | null
  expectedPayoffChapterId: string | null
  expectedPayoffChapterNumber: number | null
  payoffChapterId: string | null
  payoffChapterNumber: number | null
  riskType: 'overdue' | 'stagnant' | 'concentration' | 'continuity' | 'orphaned'
  riskLevel: 'high' | 'medium' | 'low'
  message: string
}

export interface RiskReport {
  risks: ForeshadowingRisk[]
  summary: { high: number, medium: number, low: number }
}

export interface PayoffSuggestion {
  suggestedChapter: string
  suggestedMethod: string
  reasoning: string
}

export function fetchRiskAnalysis(projectId: string) {
  return apiGet<RiskReport>(`/api/projects/${projectId}/foreshadowing-analysis/risks`)
}

export function fetchPayoffSuggestion(projectId: string, id: string) {
  return apiPost<PayoffSuggestion>(`/api/projects/${projectId}/foreshadowing-analysis/${id}/suggest-payoff`, {})
}
