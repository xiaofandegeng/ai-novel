export interface HealthMetrics {
  totalChapters: number
  completedChapters: number
  totalWords: number
  averageChapterWords: number
  activeConflicts: number
  conflictIntensityAvg: number
  conflictIntensityTrend: { chapter: number, avgIntensity: number }[]
  openForeshadowingCount: number
  foreshadowingByStatus: Record<string, number>
  confirmedTriples: number
  pendingTriples: number
  elementFrequency: { name: string, type: string, count: number }[]
  qualityTrend: { chapter: number, score: number }[]
}
