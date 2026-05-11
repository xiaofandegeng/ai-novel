export interface Act {
  id: string
  projectId: string
  volumeId: string | null
  title: string
  description: string | null
  theme: string | null
  keyEvents: string | null
  targetChapterCount: number | null
  orderIndex: number
  createdAt: string
  updatedAt: string
}

export interface CreateActInput {
  volumeId?: string
  title: string
  description?: string
  theme?: string
  keyEvents?: string
  targetChapterCount?: number
  orderIndex: number
}

export interface UpdateActInput {
  volumeId?: string | null
  title?: string
  description?: string | null
  theme?: string | null
  keyEvents?: string | null
  targetChapterCount?: number | null
  orderIndex?: number
}

export type SceneStatus = 'planned' | 'drafting' | 'reviewed' | 'completed'

export interface ChapterScene {
  id: string
  projectId: string
  chapterId: string
  sceneNumber: number
  title: string | null
  location: string | null
  timeline: string | null
  purpose: string | null
  summary: string | null
  characters: string | null
  targetWords: number | null
  content: string | null
  orderIndex: number
  status: SceneStatus
  conflict: string | null
  createdAt: string
  updatedAt: string
}

export interface CreateSceneInput {
  sceneNumber: number
  title?: string
  location?: string
  timeline?: string
  purpose?: string
  summary?: string
  characters?: string
  targetWords?: number
  content?: string
  orderIndex: number
  status?: SceneStatus
  conflict?: string
}

export interface UpdateSceneInput {
  sceneNumber?: number
  title?: string | null
  location?: string | null
  timeline?: string | null
  purpose?: string | null
  summary?: string | null
  characters?: string | null
  targetWords?: number | null
  content?: string | null
  orderIndex?: number
  status?: SceneStatus
  conflict?: string | null
}

export interface BulkCreateScenesInput {
  scenes: CreateSceneInput[]
  mode?: 'append' | 'replace'
}
