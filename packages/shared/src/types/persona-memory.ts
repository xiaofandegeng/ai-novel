export type MemoryCardType = 'technique' | 'style' | 'fingerprint' | 'pacing' | 'character_voice'

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
