import { db } from '../db'
import { aiContextSnapshots } from '../db/schema'

export async function createAIContextSnapshot(input: {
  projectId: string
  chapterId?: string | null
  scene: string
  requestId: string
  modelProvider?: string | null
  modelName?: string | null
  contextPayload: unknown
  renderedPromptPreview: string
  tokenEstimate?: number | null
}) {
  const preview = input.renderedPromptPreview.length > 8000
    ? `${input.renderedPromptPreview.substring(0, 8000)}...(已截断)`
    : input.renderedPromptPreview

  await db.insert(aiContextSnapshots).values({
    id: crypto.randomUUID(),
    projectId: input.projectId,
    chapterId: input.chapterId || null,
    scene: input.scene,
    requestId: input.requestId,
    modelProvider: input.modelProvider || null,
    modelName: input.modelName || null,
    contextPayload: JSON.stringify(input.contextPayload),
    renderedPromptPreview: preview,
    tokenEstimate: input.tokenEstimate || null,
  })
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3)
}
