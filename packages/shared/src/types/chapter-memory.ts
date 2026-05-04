export interface ChapterMemory {
  id: string
  projectId: string
  chapterId: string
  summary?: string | null
  keyEvents?: string | null
  newFacts?: string | null
  characterStateChanges?: string | null
  relationshipChanges?: string | null
  conflictProgress?: string | null
  foreshadowingAdded?: string | null
  foreshadowingResolved?: string | null
  themeProgress?: string | null
  styleNotes?: string | null
  createdAt: string
  updatedAt: string
}

export interface ConflictProgressUpdate {
  conflictId: string
  newStatus?: string
  newIntensity?: number
  progressNote?: string
}

export interface ChapterPostprocessResult {
  memory: ChapterMemory
  warnings: string[]
  conflictUpdates: ConflictProgressUpdate[]
}
