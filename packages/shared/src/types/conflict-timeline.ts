export type ConflictTimelineSourceType = 'ai_extracted' | 'manual'

export interface ConflictTimelineEvent {
  id: string
  projectId: string
  conflictId: string
  chapterId: string | null
  sceneId: string | null
  intensityBefore: number | null
  intensityAfter: number | null
  statusBefore: string | null
  statusAfter: string | null
  reason: string | null
  evidence: string | null
  sourceType: ConflictTimelineSourceType
  createdAt: string
  updatedAt: string
}

export interface CreateConflictTimelineEventInput {
  conflictId: string
  chapterId?: string
  sceneId?: string
  intensityBefore?: number
  intensityAfter?: number
  statusBefore?: string
  statusAfter?: string
  reason?: string
  evidence?: string
  sourceType?: ConflictTimelineSourceType
}

export interface UpdateConflictTimelineEventInput {
  intensityBefore?: number | null
  intensityAfter?: number | null
  statusBefore?: string | null
  statusAfter?: string | null
  reason?: string | null
  evidence?: string | null
}
