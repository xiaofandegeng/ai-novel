export type TripleSourceType = 'manual' | 'ai_extracted' | 'auto_inferred'
export type TripleStatus = 'pending' | 'confirmed' | 'rejected'

export interface StoryFactTriple {
  id: string
  projectId: string
  subjectType: string
  subjectName: string
  predicate: string
  objectType: string
  objectName: string
  confidence: number
  sourceType: TripleSourceType
  sourceChapterId: string | null
  status: TripleStatus
  relatedChapters: string | null
  notes: string | null
  createdAt: string
  updatedAt: string
}

export interface CreateTripleInput {
  subjectType: string
  subjectName: string
  predicate: string
  objectType: string
  objectName: string
  confidence?: number
  sourceType?: TripleSourceType
  sourceChapterId?: string
  status?: TripleStatus
  relatedChapters?: string
  notes?: string
}

export interface UpdateTripleInput {
  subjectType?: string
  subjectName?: string
  predicate?: string
  objectType?: string
  objectName?: string
  confidence?: number
  sourceType?: TripleSourceType
  sourceChapterId?: string | null
  status?: TripleStatus
  relatedChapters?: string | null
  notes?: string | null
}
