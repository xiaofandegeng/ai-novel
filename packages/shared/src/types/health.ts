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
  chaptersWithoutScenes: { chapterId: string, chapterNumber: number, title: string }[]
  scenesWithoutContent: number
  scenesWithoutPurpose: number
  scenesWithoutConflict: number
  sceneWordCountDeviation: { sceneId: string, sceneNumber: number, title: string | null, actual: number, target: number, deviation: number }[]
  sceneStatusDistribution: Record<string, number>
  risks: HealthRisk[]
}

export interface HealthRisk {
  id: string
  severity: 'high' | 'medium' | 'low'
  type: 'scene' | 'foreshadowing' | 'conflict' | 'quality' | 'structure' | 'knowledge'
  title: string
  message: string
  actionLabel: string
  targetRoute?: string
}
