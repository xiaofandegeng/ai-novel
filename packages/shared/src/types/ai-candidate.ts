export interface AIGenerationCandidate {
  id: string
  projectId: string
  chapterId: string | null
  contextSnapshotId: string | null
  provider: string
  model: string
  taskType: string
  content: string
  qualityScore: number | null
  userSelected: number
  userRating: number | null
  createdAt: string
  updatedAt: string
}

export interface CreateAICandidateInput {
  chapterId?: string
  contextSnapshotId?: string
  provider: string
  model: string
  taskType: string
  content: string
  qualityScore?: number
}
