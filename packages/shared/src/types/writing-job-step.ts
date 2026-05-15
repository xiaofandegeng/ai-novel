export type WritingJobStepType = 'prepare_context' | 'generate_plan' | 'confirm_plan' | 'generate_draft' | 'generate_scene_draft' | 'consistency_check' | 'confirm_apply' | 'apply_draft' | 'save_version' | 'postprocess' | 'confirm_suggestions' | 'apply_suggestions' | 'update_health' | 'done'
export type WritingJobStepStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped'
export type AutoDecision = 'approved' | 'paused' | 'rejected' | 'not_applicable'

export interface WritingJobStep {
  id: string
  jobId: string
  stepType: WritingJobStepType
  status: WritingJobStepStatus
  reviewRequired: boolean
  autoDecision: AutoDecision | null
  autoDecisionReason: string | null
  input: string | null
  output: string | null
  error: string | null
  startedAt: string | null
  finishedAt: string | null
  createdAt: string
  updatedAt: string
}
