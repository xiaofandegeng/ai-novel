import { apiGet, apiPost } from './client'

export interface AIQualityFeedback {
  projectId: string
  chapterId?: string
  contextSnapshotId?: string
  modelProvider: string
  modelName: string
  taskType: string
  ratingOverall: number
  ratingConsistency?: number
  ratingCharacter?: number
  ratingPlot?: number
  ratingStyle?: number
  ratingUsefulness?: number
  issueTags?: string[]
  comment?: string
  accepted: number
}

export const aiQualityApi = {
  submitFeedback: (feedback: AIQualityFeedback) =>
    apiPost('/api/ai-quality-feedback', feedback),

  getProjectFeedback: (projectId: string) =>
    apiGet<AIQualityFeedback[]>(`/api/ai-quality-feedback/${projectId}`),
}
