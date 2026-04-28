export type ProjectStatus = 'planning' | 'writing' | 'paused' | 'completed' | 'archived'

export type ChapterStatus = 'not_started' | 'planning' | 'writing' | 'completed'

export type CharacterRole = 'protagonist' | 'antagonist' | 'mentor' | 'ally' | 'supporting' | 'extra'

export interface NovelProject {
  id: string
  title: string
  description?: string
  genre?: string
  theme?: string
  targetWords?: number
  targetAudience?: string
  styleProfile?: string
  status: ProjectStatus
  createdAt: string
  updatedAt: string
}

export interface StoryBible {
  id: string
  projectId: string
  worldview?: string
  mainConflict?: string
  theme?: string
  rules?: string
  timeline?: string
  createdAt: string
  updatedAt: string
}

export interface Character {
  id: string
  projectId: string
  name: string
  role?: CharacterRole
  goal?: string
  fear?: string
  secret?: string
  desire?: string
  weakness?: string
  personality?: string
  arc?: string
  createdAt: string
  updatedAt: string
}

export interface Volume {
  id: string
  projectId: string
  title: string
  summary?: string
  orderIndex: number
  createdAt: string
  updatedAt: string
}

export interface Chapter {
  id: string
  projectId: string
  volumeId?: string
  chapterNumber: number
  title: string
  outline?: string
  draft?: string
  summary?: string
  characters?: string
  goals?: string
  conflicts?: string
  events?: string
  emotionalArc?: string
  foreshadowing?: string
  endingHook?: string
  status: ChapterStatus
  createdAt: string
  updatedAt: string
}
