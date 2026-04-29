import type { ChapterStatus, CharacterRole, ConflictStatus, ConflictType, ProjectStatus } from './novel'

export interface CreateProjectInput {
  title: string
  description?: string
  genre?: string
  theme?: string
  targetWords?: number
  targetAudience?: string
  styleProfile?: string
}

export interface UpdateProjectInput {
  title?: string
  description?: string
  genre?: string
  theme?: string
  targetWords?: number
  targetAudience?: string
  styleProfile?: string
  status?: ProjectStatus
}

export interface CreateStoryBibleInput {
  worldview?: string
  mainConflict?: string
  theme?: string
  rules?: string
  timeline?: string
}

export interface CreateCharacterInput {
  name: string
  role?: CharacterRole
  goal?: string
  fear?: string
  secret?: string
  desire?: string
  weakness?: string
  personality?: string
  arc?: string
}

export interface UpdateCharacterInput {
  name?: string
  role?: CharacterRole
  goal?: string
  fear?: string
  secret?: string
  desire?: string
  weakness?: string
  personality?: string
  arc?: string
}

export interface CreateVolumeInput {
  title: string
  summary?: string
  orderIndex: number
}

export interface UpdateVolumeInput {
  title?: string
  summary?: string
  orderIndex?: number
}

export interface CreateChapterInput {
  title: string
  chapterNumber: number
  volumeId?: string
  outline?: string
  status?: ChapterStatus
}

export interface UpdateChapterInput {
  title?: string
  chapterNumber?: number
  volumeId?: string
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
  status?: ChapterStatus
}

export interface CreateRelationshipInput {
  characterAId: string
  characterBId: string
  type: string
  strength?: number
  status?: string
  description?: string
}

export interface UpdateRelationshipInput {
  type?: string
  strength?: number
  status?: string
  description?: string
}

export interface CreateConflictInput {
  title: string
  type: ConflictType
  intensity?: number
  status?: ConflictStatus
  participants?: string
  description?: string
  resolution?: string
}

export interface UpdateConflictInput {
  title?: string
  type?: ConflictType
  intensity?: number
  status?: ConflictStatus
  participants?: string
  description?: string
  resolution?: string
}

export interface CreateVersionInput {
  content: string
  note?: string
}
