import { apiGet } from './client'

export interface WeeklyReport {
  projectId: string
  startDate: string
  endDate: string
  wordCountAdded: number
  chaptersCompleted: number
  entitiesAdded: {
    characters: number
    relationships: number
    conflicts: number
    foreshadowing: number
  }
  aiUsage: {
    totalTokens: number
    estimatedCost: number
    averageLatency: number
    successRate: number
    acceptanceRate: number
  }
}

export const opsApi = {
  getWeeklyReport: (projectId: string) =>
    apiGet<WeeklyReport>(`/api/authoring-reports/${projectId}/weekly`),

  getProjectStats: (projectId: string) =>
    apiGet<any>(`/api/projects/${projectId}/operations/stats`),
}
