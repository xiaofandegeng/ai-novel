export type MemoryCardType = 'technique' | 'style' | 'fingerprint' | 'pacing' | 'character_voice'
/** @deprecated Use MemoryCardType */
export type FragmentType = 'style_pattern' | 'dialogue_pattern' | 'narrative_preference' | 'vocabulary_tendency' | 'pacing_preference' | string

export interface PersonaMemoryCard {
  id: string
  projectId: string
  personaId?: string | null
  cardType: MemoryCardType
  content: string
  tags?: string | null
  embeddingId?: string | null
  createdAt: string
  updatedAt: string
}

/** @deprecated Use PersonaMemoryCard */
export interface PersonaMemoryFragment {
  id: string
  projectId: string
  fragmentType: string
  content: string
  confidence: number
  sourceType: string
  sourceChapterIds: string | null
  createdAt: string
  updatedAt: string
}
