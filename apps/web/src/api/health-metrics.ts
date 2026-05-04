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

export async function fetchHealthMetrics(projectId: string): Promise<HealthMetrics> {
  const res = await fetch(`/api/projects/${projectId}/health-metrics`)
  const json = await res.json()
  if (!json.success)
    throw new Error(json.error || 'Failed to fetch health metrics')
  return json.data
}
