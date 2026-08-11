import { and, desc, eq } from 'drizzle-orm'
import { db } from '../../db'
import { aiContextSnapshots } from '../../db/schema'
import { generateId, now } from '../../shared/utils'

export interface CreateSnapshotInput {
  projectId: string
  chapterId?: string
  scene?: string
  requestId: string
  modelProvider?: string
  modelName?: string
  contextPayload: unknown
  renderedPromptPreview: string
  tokenEstimate?: number
}

export async function createAIContextSnapshot(input: CreateSnapshotInput) {
  const [row] = await db.insert(aiContextSnapshots).values({
    id: generateId(),
    projectId: input.projectId,
    chapterId: input.chapterId,
    scene: input.scene,
    requestId: input.requestId,
    modelProvider: input.modelProvider,
    modelName: input.modelName,
    contextPayload: JSON.stringify(input.contextPayload),
    renderedPromptPreview: input.renderedPromptPreview,
    tokenEstimate: input.tokenEstimate,
    createdAt: now(),
  }).returning()
  return row
}

export function estimateTokens(text: string): number {
  // Rough estimate: 1 token per 2 characters for Chinese, 1 per 4 for English
  const value = text || ''
  const chineseCharacters = value.match(/[\u3400-\u9FFF]/g)?.length ?? 0
  const otherCharacters = value.length - chineseCharacters
  return Math.ceil(chineseCharacters / 2 + otherCharacters / 4)
}

export function listAIContextSnapshots(projectId: string) {
  return db.select({
    id: aiContextSnapshots.id,
    projectId: aiContextSnapshots.projectId,
    chapterId: aiContextSnapshots.chapterId,
    scene: aiContextSnapshots.scene,
    requestId: aiContextSnapshots.requestId,
    modelProvider: aiContextSnapshots.modelProvider,
    modelName: aiContextSnapshots.modelName,
    tokenEstimate: aiContextSnapshots.tokenEstimate,
    createdAt: aiContextSnapshots.createdAt,
  }).from(aiContextSnapshots).where(eq(aiContextSnapshots.projectId, projectId)).orderBy(desc(aiContextSnapshots.createdAt)).limit(50)
}

export async function getAIContextSnapshot(projectId: string, id: string) {
  const [row] = await db.select().from(aiContextSnapshots).where(
    and(eq(aiContextSnapshots.id, id), eq(aiContextSnapshots.projectId, projectId)),
  )
  return row ?? null
}
