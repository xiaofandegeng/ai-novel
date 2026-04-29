export type QualityScope = 'chapter' | 'book'

export interface QualityReport {
  id: string
  projectId: string
  chapterId?: string
  scope: QualityScope
  score: number
  rhythmScore?: number
  conflictScore?: number
  logicScore?: number
  characterScore?: number
  styleScore?: number
  issues?: string
  suggestions?: string
  createdAt: string
}

export interface RunQualityCheckInput {
  content?: string
}

export interface QualityReportParsed extends Omit<QualityReport, 'issues' | 'suggestions'> {
  issues: string[]
  suggestions: string[]
}
