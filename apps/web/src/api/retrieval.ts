import { apiPost } from './client'

export interface RetrievalResult {
  id: string
  title: string
  summary: string
  techniques?: string
  score: number
  source: string
  reasons: string[]
  scoreBreakdown: {
    keyword: number
    vector: number
    recency: number
    importance: number
  }
}

export const retrievalApi = {
  test: (projectId: string, query: string, limit = 5) =>
    apiPost<{ query: string, results: RetrievalResult[], terms: string[] }>(`/api/projects/${projectId}/retrieval/test`, { query, limit }),
}
