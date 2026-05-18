export type WritingJobMode = 'outline_only' | 'draft_only' | 'outline_then_draft' | 'scene_draft'
export type WritingJobStatus = 'idle' | 'running' | 'paused' | 'completed' | 'failed' | 'isolated'

export interface WritingJob {
  id: string
  projectId: string
  currentChapterId: string | null
  sceneId: string | null
  mode: WritingJobMode
  status: WritingJobStatus
  autoStopReason: string | null
  autoApprovedSteps: number
  targetWords: number | null
  lastError: string | null
  autonomousRunId: string | null
  createdAt: string
  updatedAt: string
}

export interface CreateWritingJobInput {
  mode: WritingJobMode
  currentChapterId?: string
  sceneId?: string
}

export interface UpdateWritingJobInput {
  currentChapterId?: string | null
  mode?: WritingJobMode
  status?: WritingJobStatus
  lastError?: string | null
}
