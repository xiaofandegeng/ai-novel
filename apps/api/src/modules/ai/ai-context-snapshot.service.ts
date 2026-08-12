import { and, desc, eq } from 'drizzle-orm'
import { db } from '../../db'
import { aiContextSnapshots } from '../../db/schema'
import { generateId } from '../../shared/utils'
import { compactAIOperationPayload, dispatchAIOperationCommand } from './ai-operations.commands'
import { RECORD_AI_OPERATION_COMMAND } from './ai-operations.eventing'

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
  const id = generateId()
  return dispatchAIOperationCommand(RECORD_AI_OPERATION_COMMAND, input.projectId, id, compactAIOperationPayload({ kind: 'context_snapshot', data: {
    chapterId: input.chapterId,
    scene: input.scene,
    requestId: input.requestId,
    modelProvider: input.modelProvider,
    modelName: input.modelName,
    contextPayload: JSON.stringify(input.contextPayload),
    renderedPromptPreview: input.renderedPromptPreview,
    tokenEstimate: input.tokenEstimate,
  } }))
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
