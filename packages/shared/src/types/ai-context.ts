export type AIScene = 'outline' | 'draft' | 'polish' | 'quality' | 'story_bible' | 'knowledge' | 'persona_training' | 'persona_drift' | 'chat'

export interface AIContextRequest {
  projectId: string
  scene: AIScene
  chapterId?: string
  sceneId?: string
  selectedText?: string
  userInstruction?: string
  extra?: Record<string, unknown>
}

export interface ChapterContextSummary {
  id: string
  title: string
  chapterNumber: number
  summary?: string
  status?: string
}

export interface CharacterContextSummary {
  id: string
  name: string
  role?: string
  goal?: string
  fear?: string
  secret?: string
  desire?: string
  weakness?: string
  personality?: string
  arc?: string
}

export interface RelationshipContextSummary {
  characterAName: string
  characterBName: string
  type: string
  strength: number
  status?: string
  description?: string
}

export interface ConflictContextSummary {
  title: string
  type: 'internal' | 'external'
  intensity: number
  status: string
  participants?: string
  description?: string
}

export interface KnowledgeContextSnippet {
  title: string
  summary: string
  techniques?: string
  reasons?: string[]
}

export interface BuiltAIContext {
  scene: AIScene
  task: string
  project: {
    title: string
    description?: string
    genre?: string
    theme?: string
    targetAudience?: string
    targetWords?: number
    styleProfile?: string
  }
  storyBible?: {
    worldview?: string
    mainConflict?: string
    theme?: string
    rules?: string
    timeline?: string
  }
  currentChapter?: {
    id: string
    title: string
    chapterNumber: number
    volumeTitle?: string
    goals?: string
    conflicts?: string
    events?: string
    emotionalArc?: string
    foreshadowing?: string
    endingHook?: string
    draftExcerpt?: string
  }
  currentScene?: {
    id: string
    title: string | null
    sceneNumber: number
    location: string | null
    timeline: string | null
    purpose: string | null
    summary: string | null
    characters: string | null
    conflict: string | null
    targetWords: number | null
    content: string | null
  }
  chapterScenes?: Array<{
    id: string
    sceneNumber: number
    title: string | null
    status: string
    summary: string | null
  }>
  nearbyChapters?: {
    previous?: ChapterContextSummary
    next?: ChapterContextSummary
  }
  characters: CharacterContextSummary[]
  relationships: RelationshipContextSummary[]
  conflicts: ConflictContextSummary[]
  persona?: {
    name: string
    strength: number
    prompt: string
  }
  knowledgeSnippets: KnowledgeContextSnippet[]
  chapterMemories: string[]
  chapterElements: string[]
  foreshadowingItems: string[]
  factTriples: string[]
  constraints: string[]
}
