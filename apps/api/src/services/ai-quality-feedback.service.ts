import type { AIQualityFeedback as IAIQualityFeedback } from '@ai-novel/shared'
import { db } from '../db'
import { aiQualityFeedback } from '../db/schema'
import { generateId } from '../utils'

export class AIQualityFeedbackService {
  static async createFeedback(data: Omit<IAIQualityFeedback, 'id' | 'createdAt'>) {
    const id = generateId()
    await db.insert(aiQualityFeedback).values({
      id,
      projectId: data.projectId,
      chapterId: data.chapterId || null,
      sceneId: data.sceneId || null,
      contextSnapshotId: data.contextSnapshotId || null,
      modelProvider: data.modelProvider,
      modelName: data.modelName,
      taskType: data.taskType,
      ratingOverall: data.ratingOverall,
      ratingConsistency: data.ratingConsistency || null,
      ratingCharacter: data.ratingCharacter || null,
      ratingPlot: data.ratingPlot || null,
      ratingStyle: data.ratingStyle || null,
      ratingUsefulness: data.ratingUsefulness || null,
      issueTags: data.issueTags || null,
      comment: data.comment || null,
      accepted: data.accepted,
    })
    return id
  }

  static async getProjectFeedback(projectId: string) {
    return await db.query.aiQualityFeedback.findMany({
      where: (fields, { eq }) => eq(fields.projectId, projectId),
      orderBy: (fields, { desc }) => [desc(fields.createdAt)],
    })
  }
}
