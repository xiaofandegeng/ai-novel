export type AuthoringEventType
  = 'project_opened'
    | 'chapter_opened'
    | 'ai_context_built'
    | 'ai_generation_started'
    | 'ai_generation_confirmed'
    | 'ai_generation_discarded'
    | 'draft_applied'
    | 'postprocess_started'
    | 'suggestion_applied'
    | 'health_risk_opened'
    | 'export_created'
    | 'import_completed'

export type AuthoringEventSource = 'manual' | 'ai' | 'system' | 'task' | 'smoke'

export interface AuthoringEvent {
  id: string
  projectId: string
  chapterId?: string | null
  sceneId?: string | null
  eventType: AuthoringEventType
  source: AuthoringEventSource
  payload?: any
  createdAt: string
}

export interface AIQualityFeedback {
  id: string
  projectId: string
  chapterId?: string | null
  sceneId?: string | null
  contextSnapshotId?: string | null
  modelProvider: string
  modelName: string
  taskType: string
  ratingOverall: number
  ratingConsistency?: number | null
  ratingCharacter?: number | null
  ratingPlot?: number | null
  ratingStyle?: number | null
  ratingUsefulness?: number | null
  issueTags?: string[] | null
  comment?: string | null
  accepted: number
  createdAt: string
}

export interface PromptTemplate {
  id: string
  name: string
  taskType: string
  version: string
  content: string
  variablesSchema?: any
  status: 'active' | 'deprecated'
  createdAt: string
  updatedAt: string
}

export interface AIUsageRecord {
  id: string
  projectId: string
  chapterId?: string | null
  contextSnapshotId?: string | null
  provider: string
  model: string
  taskType: string
  promptTokens: number
  completionTokens: number
  totalTokens: number
  estimatedCost?: string | null
  latencyMs: number
  status: 'success' | 'error'
  errorCode?: string | null
  createdAt: string
}

export interface AuthoringReport {
  projectId: string
  startDate: string
  endDate: string
  wordCountAdded: number
  chaptersCompleted: number
  entitiesAdded: {
    characters: number
    relationships: number
    conflicts: number
    foreshadowing: number
  }
  foreshadowingResolved: number
  newHealthRisks: number
  aiUsage: {
    totalTokens: number
    estimatedCost: number
    averageLatency: number
    successRate: number
    acceptanceRate: number
  }
  topRisks: any[]
  suggestions: string[]
}
