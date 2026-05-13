export type ForeshadowingStatus = 'open' | 'progressing' | 'paid_off' | 'abandoned'
export type ForeshadowingImportance = 'major' | 'normal' | 'minor'

export interface ForeshadowingItem {
  id: string
  projectId: string
  title: string
  description: string | null
  setupChapterId: string | null
  expectedPayoffChapterId: string | null
  payoffChapterId: string | null
  status: ForeshadowingStatus
  importance: ForeshadowingImportance
  relatedCharacters: string | null
  characterIds: string[] | null
  relatedEvents: string | null
  notes: string | null
  createdAt: string
  updatedAt: string
}

export interface CreateForeshadowingInput {
  title: string
  description?: string
  setupChapterId?: string
  expectedPayoffChapterId?: string
  payoffChapterId?: string
  status?: ForeshadowingStatus
  importance?: ForeshadowingImportance
  relatedCharacters?: string
  characterIds?: string[]
  relatedEvents?: string
  notes?: string
}

export interface UpdateForeshadowingInput {
  title?: string
  description?: string | null
  setupChapterId?: string | null
  expectedPayoffChapterId?: string | null
  payoffChapterId?: string | null
  status?: ForeshadowingStatus
  importance?: ForeshadowingImportance
  relatedCharacters?: string | null
  characterIds?: string[] | null
  relatedEvents?: string | null
  notes?: string | null
}
