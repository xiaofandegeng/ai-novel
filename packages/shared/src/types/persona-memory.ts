export type FragmentType = 'style_pattern' | 'dialogue_pattern' | 'narrative_preference' | 'vocabulary_tendency' | 'pacing_preference'
export type FragmentSourceType = 'manual' | 'ai_extracted' | 'accumulated'

export interface PersonaMemoryFragment {
  id: string
  projectId: string
  fragmentType: FragmentType
  content: string
  confidence: number
  sourceType: FragmentSourceType
  sourceChapterIds: string | null
  createdAt: string
  updatedAt: string
}
