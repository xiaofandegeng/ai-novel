export interface HealthMetrics {
  totalChapters: number
  completedChapters: number
  totalWords: number
  averageChapterWords: number
  activeConflicts: number
  conflictIntensityAvg: number
  conflictIntensityTrend: { chapter: number, avgIntensity: number }[]
  tensionTrend: { chapter: number, tension: number }[]
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
  radarMetrics: {
    theme: number
    character: number
    foreshadowing: number
    conflict: number
    pacing: number
    style: number
  }
  changeSetMetrics?: {
    recentRiskTrend: { id: string, riskLevel: string, chapterNumber: number }[]
    pendingCount: number
    failedCount: number
  }
}

export interface HealthRisk {
  id: string
  severity: 'high' | 'medium' | 'low'
  type: 'scene' | 'foreshadowing' | 'conflict' | 'quality' | 'structure' | 'knowledge' | 'consistency' | 'theme' | 'style' | 'pacing'
  title: string
  message: string
  actionLabel: string
  targetRoute?: string
  evidence?: string[]
  suggestions?: string[]
  fixActionType?: 'plan_scenes' | 'suggest_conflicts' | 'analyze_quality' | 'brainstorm_foreshadowing' | 'create_task'
  fixActionPayload?: Record<string, any>
}
