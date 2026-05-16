export type AutonomousRunStatus
  = | 'idle'
    | 'running'
    | 'paused'
    | 'completed'
    | 'failed'
    | 'needs_attention'

export type AutonomousStrategy = 'safe' | 'balanced' | 'fast'

export type AutonomousScopeType
  = | 'project'
    | 'volume'
    | 'chapter_range'
    | 'next_n_chapters'
    | 'from_current_forward'
    | 'continue_incomplete'
    | 'rewrite_selected'

export interface AutonomousWritingRun {
  id: string
  projectId: string
  status: AutonomousRunStatus
  strategy: AutonomousStrategy
  scopeType: AutonomousScopeType
  volumeId: string | null
  startChapterId: string | null
  endChapterId: string | null
  targetChapterCount: number | null
  targetWordsPerChapter: number
  currentChapterId: string | null
  completedChapterCount: number
  failedChapterCount: number
  pausedReason: string | null
  lastError: string | null
  startedAt: string | null
  finishedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface AutonomousRunJob {
  id: string
  runId: string
  projectId: string
  writingJobId: string
  chapterId: string | null
  sceneId: string | null
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped' | 'waiting_review' | 'isolated'
  orderIndex: number
  isolationReason?: string | null
  isolationReport?: Record<string, any> | null
  createdAt: string
  updatedAt: string
}

export type AutonomousExceptionType
  = | 'consistency_blocked'
    | 'high_risk_change_set'
    | 'apply_failed'
    | 'ai_failed'
    | 'health_regression'
    | 'manual_required'

export type AutonomousExceptionStatus = 'open' | 'resolved' | 'ignored' | 'auto_resolved' | 'isolated' | 'resolved_by_user'
export type AutoResolutionStrategy = 'repair' | 'skip_chapter' | 'isolate_chapter' | 'retry' | 'stop_run'

export interface AutonomousRunException {
  id: string
  runId: string
  projectId: string
  chapterId: string | null
  changeSetId: string | null
  writingJobId: string | null
  stepId: string | null
  exceptionType: AutonomousExceptionType
  severity: 'medium' | 'high' | 'critical'
  title: string
  description: string | null
  status: AutonomousExceptionStatus
  autoResolutionStrategy?: AutoResolutionStrategy | null
  resolution: string | null
  resolutionReport?: Record<string, any> | null
  createdAt: string
  updatedAt: string
}

export interface CreateAutonomousRunInput {
  strategy: AutonomousStrategy
  scopeType: AutonomousScopeType
  volumeId?: string
  startChapterId?: string
  endChapterId?: string
  targetChapterCount?: number
  targetWordsPerChapter?: number
}
