export type ChapterElementType = 'character' | 'location' | 'item' | 'organization' | 'event'
export type ChapterElementRelationType = 'appears' | 'mentioned' | 'scene' | 'uses' | 'involved' | 'occurs'
export type ChapterElementImportance = 'major' | 'normal' | 'minor'

export interface ChapterElement {
  id: string
  projectId: string
  chapterId: string
  elementType: ChapterElementType
  elementId: string | null
  elementName: string
  relationType: ChapterElementRelationType
  importance: ChapterElementImportance
  appearanceOrder: number | null
  notes: string | null
  createdAt: string
  updatedAt: string
}

export interface CreateChapterElementInput {
  elementType: ChapterElementType
  elementId?: string
  elementName: string
  relationType: ChapterElementRelationType
  importance?: ChapterElementImportance
  appearanceOrder?: number
  notes?: string
}

export interface UpdateChapterElementInput {
  elementType?: ChapterElementType
  elementId?: string | null
  elementName?: string
  relationType?: ChapterElementRelationType
  importance?: ChapterElementImportance
  appearanceOrder?: number | null
  notes?: string | null
}
