export type WritingJobMode = 'outline_only' | 'draft_only' | 'outline_then_draft' | 'scene_draft'
export type WritingJobStatus = 'idle' | 'running' | 'waiting_review' | 'paused' | 'completed' | 'failed'
export type WritingJobExecutionMode = 'manual' | 'auto'
export type AutoApprovalLevel = 'conservative' | 'balanced' | 'aggressive'

export interface WritingJob {
  id: string
  projectId: string
  currentChapterId: string | null
  sceneId: string | null
  mode: WritingJobMode
  status: WritingJobStatus
  executionMode: WritingJobExecutionMode
  autoApprovalLevel: AutoApprovalLevel
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
  executionMode?: WritingJobExecutionMode
  autoApprovalLevel?: AutoApprovalLevel
}

export interface UpdateWritingJobInput {
  currentChapterId?: string | null
  mode?: WritingJobMode
  status?: WritingJobStatus
  lastError?: string | null
}
