export type KnowledgeSourceType = 'classic' | 'reference' | 'personal'
export type KnowledgeSourceStatus = 'pending' | 'processing' | 'completed' | 'failed'

export interface KnowledgeSource {
  id: string
  projectId: string
  title: string
  author?: string
  sourceType: KnowledgeSourceType
  fileName?: string
  fileSize?: number
  status: KnowledgeSourceStatus
  createdAt: string
  updatedAt: string
}

export interface KnowledgeChunk {
  id: string
  sourceId: string
  projectId: string
  chunkType: string
  title?: string
  content: string
  summary?: string
  techniques?: string
  orderIndex: number
  createdAt: string
}

export interface KnowledgeNote {
  id: string
  sourceId?: string
  projectId: string
  title: string
  content: string
  tags?: string
  createdAt: string
}

export interface KnowledgeSourceDetail extends KnowledgeSource {
  chunks: KnowledgeChunk[]
}

export interface CreateKnowledgeSourceInput {
  title: string
  author?: string
  sourceType?: KnowledgeSourceType
  fileName?: string
  fileSize?: number
}

export interface AnalyzeSourceInput {
  content: string
}

export interface CreateKnowledgeNoteInput {
  title: string
  content: string
  tags?: string
  sourceId?: string
}
