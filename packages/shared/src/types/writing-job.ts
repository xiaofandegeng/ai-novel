export type WritingJobMode = 'outline_only' | 'draft_only' | 'outline_then_draft'
export type WritingJobStatus = 'idle' | 'running' | 'waiting_review' | 'paused' | 'completed' | 'failed'

export interface WritingJob {
  id: string
  projectId: string
  currentChapterId: string | null
  mode: WritingJobMode
  status: WritingJobStatus
  lastError: string | null
  createdAt: string
  updatedAt: string
}

export interface CreateWritingJobInput {
  mode: WritingJobMode
  currentChapterId?: string
}

export interface UpdateWritingJobInput {
  currentChapterId?: string | null
  mode?: WritingJobMode
  status?: WritingJobStatus
  lastError?: string | null
}
