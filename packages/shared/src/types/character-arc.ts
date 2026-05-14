export type CharacterArcEventType
  = | 'goal_shift'
    | 'fear_triggered'
    | 'secret_revealed'
    | 'relationship_changed'
    | 'belief_changed'
    | 'ability_changed'
    | 'trauma'
    | 'victory'
    | 'loss'

export type CharacterArcSource = 'ai_extracted' | 'manual'

export interface CharacterArcEvent {
  id: string
  projectId: string
  characterId: string
  chapterId: string | null
  sceneId: string | null
  eventType: CharacterArcEventType
  beforeState: string | null
  afterState: string | null
  motivationChange: string | null
  relationshipImpact: string | null
  evidence: string | null
  sourceType: CharacterArcSource
  createdAt: string
  updatedAt: string
}

export interface CreateCharacterArcEventInput {
  characterId: string
  chapterId?: string
  sceneId?: string
  eventType: CharacterArcEventType
  beforeState?: string
  afterState?: string
  motivationChange?: string
  relationshipImpact?: string
  evidence?: string
  sourceType?: CharacterArcSource
}

export interface UpdateCharacterArcEventInput {
  eventType?: CharacterArcEventType
  chapterId?: string | null
  sceneId?: string | null
  beforeState?: string | null
  afterState?: string | null
  motivationChange?: string | null
  relationshipImpact?: string | null
  evidence?: string | null
}
