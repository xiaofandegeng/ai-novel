export type ChapterChangeSetStatus
  = | 'drafted'
    | 'reviewing'
    | 'approved'
    | 'applied'
    | 'blocked'
    | 'rejected'
    | 'apply_failed'

export type ChangeSetItemType
  = | 'draft'
    | 'character_create'
    | 'character_update'
    | 'relationship_create'
    | 'relationship_update'
    | 'conflict_create'
    | 'conflict_update'
    | 'foreshadowing_create'
    | 'foreshadowing_payoff'
    | 'fact_create'
    | 'chapter_memory'
    | 'style_note'
    | 'continuity_note'

export interface ChapterChangeSet {
  id: string
  projectId: string
  chapterId: string
  sceneId: string | null
  writingJobId: string | null
  sourceStepId: string | null
  status: ChapterChangeSetStatus
  riskLevel: 'low' | 'medium' | 'high'
  riskSummary: string | null
  draftTitle: string | null
  draftContent: string | null
  consistencyReportJson: any
  extractedChangesJson: any
  applyReportJson: any
  beforeSnapshotId: string | null
  afterSnapshotId: string | null
  createdAt: string | Date
  updatedAt: string | Date
  appliedAt: string | Date | null
}

export interface ChapterChangeSetItem {
  id: string
  changeSetId: string
  projectId: string
  chapterId: string
  itemType: ChangeSetItemType
  riskLevel: 'low' | 'medium' | 'high'
  title: string
  payloadJson: any
  status: 'pending' | 'approved' | 'applied' | 'blocked' | 'rejected' | 'apply_failed'
  applyError: string | null
  createdAt: string | Date
  updatedAt: string | Date
}
