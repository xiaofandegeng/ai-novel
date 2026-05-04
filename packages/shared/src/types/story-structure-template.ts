export type StructureType = 'three_act' | 'five_act' | 'hero_journey' | 'custom'

export interface ActDefinition {
  title: string
  description: string
  theme: string
  targetChapterCount: number
  keyEvents: string[]
}

export interface StoryStructureTemplate {
  id: string
  name: string
  description: string | null
  genre: string | null
  structureType: StructureType
  actsJson: string | null
  chapterCountEstimate: number | null
  isBuiltin: number
  createdAt: string
  updatedAt: string
}

export interface ProjectAppliedTemplate {
  id: string
  projectId: string
  templateId: string
  appliedAt: string
  status: 'applied' | 'modified'
}
