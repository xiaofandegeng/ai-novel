export type WritingJobStepType = 'prepare_context' | 'generate_plan' | 'confirm_plan' | 'generate_draft' | 'consistency_check' | 'confirm_apply' | 'save_version' | 'postprocess' | 'confirm_suggestions' | 'update_health'
export type WritingJobStepStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped'

export interface WritingJobStep {
  id: string
  jobId: string
  stepType: WritingJobStepType
  status: WritingJobStepStatus
  input: string | null
  output: string | null
  error: string | null
  startedAt: string | null
  finishedAt: string | null
  createdAt: string
  updatedAt: string
}
