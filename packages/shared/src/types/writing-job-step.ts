export type WritingJobStepType
  = | 'prepare_context'
    | 'generate_plan'
    | 'confirm_plan'
    | 'generate_draft'
    | 'generate_scene_draft'
    | 'consistency_check'
    | 'confirm_apply'
    | 'apply_draft'
    | 'save_version'
    | 'postprocess'
    | 'confirm_suggestions'
    | 'apply_suggestions'
    | 'update_health'
    | 'build_change_set'
    | 'review_change_set'
    | 'apply_change_set'
    | 'auto_repair'
    | 'done'
export type WritingJobStepStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped'
export type AutoDecision = 'approved' | 'paused' | 'rejected' | 'not_applicable' | 'medium_risk_repair' | 'repaired' | 'isolated' | 'skipped' | 'failed'
export type AutoRiskLevel = 'none' | 'low' | 'medium' | 'high' | 'critical'

export interface WritingJobStep {
  id: string
  jobId: string
  stepType: WritingJobStepType
  status: WritingJobStepStatus
  reviewRequired: boolean
  autoDecision: AutoDecision | null
  autoRiskLevel?: AutoRiskLevel | null
  autoDecisionReason: string | null
  autoDecisionReport?: Record<string, any> | null
  input: string | null
  output: string | null
  error: string | null
  changeSetId: string | null
  startedAt: string | null
  finishedAt: string | null
  createdAt: string
  updatedAt: string
}
