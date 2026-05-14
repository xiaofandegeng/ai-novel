import { db } from '../db'
import { aiUsageRecords } from '../db/schema'
import { generateId } from '../utils'

export class AIUsageService {
  static async recordUsage(params: {
    projectId: string
    chapterId?: string | null
    contextSnapshotId?: string | null
    provider: string
    model: string
    taskType: string
    promptTokens: number
    completionTokens: number
    totalTokens: number
    latencyMs: number
    status: 'success' | 'error'
    estimatedCost?: string | null
    errorCode?: string | null
  }) {
    const id = generateId()
    await db.insert(aiUsageRecords).values({
      id,
      projectId: params.projectId,
      chapterId: params.chapterId || null,
      contextSnapshotId: params.contextSnapshotId || null,
      provider: params.provider,
      model: params.model,
      taskType: params.taskType,
      promptTokens: params.promptTokens,
      completionTokens: params.completionTokens,
      totalTokens: params.totalTokens,
      latencyMs: params.latencyMs,
      status: params.status,
      estimatedCost: params.estimatedCost || null,
      errorCode: params.errorCode || null,
    })
    return id
  }

  static async getProjectUsageStats(projectId: string) {
    // Basic aggregation can be done here or in the report service
    return await db.query.aiUsageRecords.findMany({
      where: (fields, { eq }) => eq(fields.projectId, projectId),
      orderBy: (fields, { desc }) => [desc(fields.createdAt)],
    })
  }
}
