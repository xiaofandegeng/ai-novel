export interface AIContextSnapshot {
  id: string
  projectId: string
  chapterId: string | null
  scene: string | null
  requestId: string
  modelProvider: string | null
  modelName: string | null
  contextPayload: string | null
  renderedPromptPreview: string | null
  tokenEstimate: number | null
  createdAt: string
}
