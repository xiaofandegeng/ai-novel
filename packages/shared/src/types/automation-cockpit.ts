export interface CockpitProjectSummary {
  id: string
  title: string
  genre?: string
  theme?: string
  targetWordCount?: number
  currentWordCount: number
}

export interface CockpitRunSummary {
  id: string
  status: 'running' | 'paused' | 'waiting_review' | 'completed' | 'failed' | 'abandoned' | 'cancelled' | 'idle'
  strategy: 'safe' | 'balanced' | 'fast'
  targetChapterCount: number
  completedChapterCount: number
  currentChapterId?: string
  startedAt?: string
  finishedAt?: string
}

export interface CockpitChapterStep {
  key: string
  label: string
  status: 'pending' | 'running' | 'completed' | 'failed' | 'blocked'
  error?: string
  startedAt?: string
  finishedAt?: string
}

export interface CockpitChapterProgress {
  id: string
  title: string
  orderIndex: number
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped' | 'isolated'
  wordCount?: number
  steps: CockpitChapterStep[]
}

export interface CockpitCharacterState {
  id: string
  name: string
  role?: string | null
  emotion?: string | null
  goal?: string | null
  fear?: string | null
  secret?: string | null
  weakness?: string | null
  personality?: string | null
  relationshipPressure?: string | null
  lastChangedChapterId?: string | null
  confidence?: number | null
}

export interface CockpitRelationshipState {
  id: string
  sourceCharacterId: string
  targetCharacterId: string
  sourceName: string
  targetName: string
  type: string
  intimacy?: number | null
  trust?: number | null
  conflict?: number | null
  recentChange?: string | null
  lastChangedChapterId?: string | null
}

export interface CockpitConflictState {
  id: string
  title: string
  type: 'internal' | 'external'
  intensity: number
  status: 'latent' | 'forming' | 'escalating' | 'exploding' | 'resolved' | 'abandoned'
  participants?: string | null
  participantIds?: string | null
  description?: string | null
  resolution?: string | null
}

export interface CockpitForeshadowingState {
  id: string
  title: string
  description?: string | null
  setupChapterId?: string | null
  expectedPayoffChapterId?: string | null
  payoffChapterId?: string | null
  status: 'open' | 'progressing' | 'paid_off' | 'abandoned'
  importance: 'major' | 'normal' | 'minor'
  relatedCharacters?: string | null
}

export interface CockpitPlotDirection {
  themeProgress?: string
  nextChapterGoal?: string
  nextChapterEvents?: string
  suggestions?: string[]
  globalGuardrails?: string[]
  activeConstraints?: string[]
  healthWarnings?: string[]
}

export interface CockpitHealthSummary {
  overallScore: number
  riskCount: number
  details?: {
    scope: string
    score: number
    riskLevel: 'low' | 'medium' | 'high'
    description?: string
  }[]
}

export interface CockpitNarrativeEvent {
  id: string
  type: string
  status: 'auto_applied' | 'pending_review' | 'isolated' | 'failed' | 'ignored' | 'approved'
  title: string
  summary: string
  sourceChapterId?: string
  confidence?: number
  changeSetId?: string
  createdAt: string
}

export interface AutomationCockpitPayload {
  project: CockpitProjectSummary
  run: CockpitRunSummary | null
  chapters: CockpitChapterProgress[]
  characters: CockpitCharacterState[]
  relationships: CockpitRelationshipState[]
  conflicts: CockpitConflictState[]
  foreshadowing: CockpitForeshadowingState[]
  plotDirection: CockpitPlotDirection
  health: CockpitHealthSummary
  events: CockpitNarrativeEvent[]
}

export interface CockpitChapterDetail {
  id: string
  title: string
  content?: string | null
  summary?: string | null
  notes?: string | null
  scenes: {
    id: string
    title: string
    summary?: string | null
    content?: string | null
    status: 'pending' | 'completed' | 'failed'
  }[]
}
