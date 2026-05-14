import { desc, eq } from 'drizzle-orm'
import { db } from '../db'
import { aiContextSnapshots } from '../db/schema'
import { generateId, now } from '../utils'

export interface CreateSnapshotInput {
  projectId: string
  chapterId?: string
  scene?: string
  requestId: string
  modelProvider?: string
  modelName?: string
  contextPayload: any
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

export async function getSnapshotsByProject(projectId: string, limit = 50) {
  return db.select().from(aiContextSnapshots).where(eq(aiContextSnapshots.projectId, projectId)).orderBy(desc(aiContextSnapshots.createdAt)).limit(limit)
}

export async function getSnapshotById(id: string) {
  const [row] = await db.select().from(aiContextSnapshots).where(eq(aiContextSnapshots.id, id))
  return row || null
}

export function estimateTokens(text: string): number {
  // Rough estimate: 1 token per 2 characters for Chinese, 1 per 4 for English
  // Average around 1 token per 3 characters for mixed
  return Math.ceil((text || '').length / 2.5)
}
