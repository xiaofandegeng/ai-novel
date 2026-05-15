export type SuggestionType = 'fact_triple' | 'foreshadowing_add' | 'foreshadowing_payoff' | 'chapter_element' | 'character_add' | 'character_state' | 'conflict_add' | 'conflict_update' | 'continuity_note' | 'style_note' | 'relationship_update'
export type SuggestionStatus = 'pending' | 'accepted' | 'rejected' | 'applied' | 'acknowledged' | 'apply_failed'

export interface PostprocessSuggestion {
  id: string
  projectId: string
  chapterId: string
  runId: string | null
  suggestionType: SuggestionType
  payload: string
  confidence: number
  status: SuggestionStatus
  reason: string | null
  createdAt: string
  updatedAt: string
}
