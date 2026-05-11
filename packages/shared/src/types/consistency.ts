export type ConsistencyStatus = 'pass' | 'warning' | 'blocked'
export type ConsistencyRiskSeverity = 'low' | 'medium' | 'high'
export type ConsistencyRiskType
  = 'theme_drift'
    | 'plot_gap'
    | 'character_ooc'
    | 'world_rule_break'
    | 'foreshadowing_break'
    | 'style_drift'
    | 'new_unapproved_fact'

export interface ConsistencyRisk {
  severity: ConsistencyRiskSeverity
  type: ConsistencyRiskType
  message: string
  evidence?: string
  scope?: 'chapter' | 'scene'
}

export interface GuardDimensionResult {
  status: ConsistencyStatus
  score: number
  reason: string
}

export interface ConsistencyGuardReport {
  overallStatus: ConsistencyStatus
  score: number
  themeAlignment: GuardDimensionResult
  plotContinuity: GuardDimensionResult
  characterConsistency: GuardDimensionResult
  worldRuleConsistency: GuardDimensionResult
  foreshadowingConsistency: GuardDimensionResult
  styleConsistency: GuardDimensionResult
  risks: ConsistencyRisk[]
  suggestedFixes: string[]
}

export interface RunConsistencyCheckInput {
  chapterId?: string
  sceneId?: string
  scene: 'outline' | 'draft' | 'polish' | 'quality'
  generatedText: string
  sourceInstruction?: string
}

export interface ContinuityIssue {
  type: string
  severity: 'low' | 'medium' | 'high'
  description: string
  evidence: string[]
  suggestion: string
}

export interface ContinuityReport {
  issues: ContinuityIssue[]
  chapterCount: number
  analyzedAt: string
}
