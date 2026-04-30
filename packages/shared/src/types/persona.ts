export type TrainingSetStatus = 'draft' | 'analyzing' | 'ready' | 'failed'
export type ReferenceWorkStatus = 'uploaded' | 'splitting' | 'analyzing' | 'completed' | 'partial_failed' | 'failed'
export type ReferenceWorkSourceType = 'webnovel' | 'reference' | 'sample'
export type PersonaStatus = 'draft' | 'published' | 'archived'

export interface ReferenceTrainingSet {
  id: string
  name: string
  description?: string
  genre?: string
  targetPersonaType?: string
  status: TrainingSetStatus
  createdAt: string
  updatedAt: string
}

export interface ReferenceWork {
  id: string
  trainingSetId: string
  title: string
  author?: string
  sourceType: ReferenceWorkSourceType
  fileName?: string
  fileSize?: number
  wordCount?: number
  chapterCount?: number
  status: ReferenceWorkStatus
  createdAt: string
  updatedAt: string
}

export interface ReferenceChapter {
  id: string
  workId: string
  trainingSetId: string
  title: string
  chapterNumber: number
  content: string
  wordCount: number
  createdAt: string
}

export interface ChapterAnalysis {
  id: string
  chapterId: string
  workId: string
  trainingSetId: string
  openingHook?: string
  conflictType?: string
  pressureSource?: string
  protagonistAction?: string
  payoffType?: string
  cliffhanger?: string
  emotionCurve?: string
  pacingScore?: number
  dialogueRatio?: number
  descriptionRatio?: number
  narrativePattern?: string
  tropeTags?: string
  craftNotes?: string
  riskNotes?: string
  createdAt: string
}

export interface ReferenceChapterAnalysisError {
  id: string
  chapterId: string
  workId: string
  trainingSetId: string
  message: string
  createdAt: string
  chapterTitle?: string
  chapterNumber?: number
}

export interface WorkStyleReport {
  id: string
  workId: string
  trainingSetId: string
  summary?: string
  coreAppeal?: string
  pacingModel?: string
  hookModel?: string
  conflictModel?: string
  characterModel?: string
  languageProfile?: string
  chapterTemplate?: string
  strengths?: string
  weaknesses?: string
  avoidCopying?: string
  createdAt: string
}

export interface WritingPersona {
  id: string
  name: string
  description?: string
  genre?: string
  sourceTrainingSetId?: string
  status: PersonaStatus
  coreAppeal?: string
  pacingRules?: string
  conflictRules?: string
  characterRules?: string
  languageRules?: string
  chapterRules?: string
  hookRules?: string
  forbiddenRules?: string
  similarityGuardrails?: string
  createdAt: string
  updatedAt: string
}

export interface ProjectPersonaConfig {
  id: string
  projectId: string
  personaId: string
  strength: number
  enabledForOutline: number
  enabledForDraft: number
  enabledForPolish: number
  enabledForQualityReview: number
  projectOverrides?: string
  disabledRules?: string
  createdAt: string
  updatedAt: string
}

export interface CreateTrainingSetInput {
  name: string
  description?: string
  genre?: string
  targetPersonaType?: string
}

export interface CreateReferenceWorkInput {
  title: string
  author?: string
  sourceType?: ReferenceWorkSourceType
  fileName?: string
  fileSize?: number
}

export interface CreatePersonaInput {
  name: string
  description?: string
  genre?: string
}

export interface UpdateProjectPersonaConfigInput {
  personaId: string
  strength?: number
  enabledForOutline?: boolean
  enabledForDraft?: boolean
  enabledForPolish?: boolean
  enabledForQualityReview?: boolean
  projectOverrides?: string
  disabledRules?: string
}
