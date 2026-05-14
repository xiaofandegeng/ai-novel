import type { CreateAICandidateInput } from '@ai-novel/shared'
import { and, desc, eq } from 'drizzle-orm'
import { db } from '../db'
import { aiGenerationCandidates } from '../db/schema'
import { generateId, now } from '../utils'

export class AICandidateService {
  static async getCandidates(projectId: string, filters?: { chapterId?: string, taskType?: string }) {
    const conditions = [eq(aiGenerationCandidates.projectId, projectId)]

    if (filters?.chapterId) {
      conditions.push(eq(aiGenerationCandidates.chapterId, filters.chapterId))
    }
    if (filters?.taskType) {
      conditions.push(eq(aiGenerationCandidates.taskType, filters.taskType))
    }

    return db.select().from(aiGenerationCandidates).where(and(...conditions)).orderBy(desc(aiGenerationCandidates.createdAt))
  }

  static async selectCandidate(projectId: string, candidateId: string) {
    // First clear any existing selection for this project/chapter scope
    const [candidate] = await db.select().from(aiGenerationCandidates).where(
      and(eq(aiGenerationCandidates.id, candidateId), eq(aiGenerationCandidates.projectId, projectId)),
    )
    if (!candidate)
      return null

    // Clear previous selections for the same chapter and task type
    if (candidate.chapterId) {
      await db.update(aiGenerationCandidates)
        .set({ userSelected: 0, updatedAt: now() })
        .where(
          and(
            eq(aiGenerationCandidates.projectId, projectId),
            eq(aiGenerationCandidates.chapterId, candidate.chapterId),
            eq(aiGenerationCandidates.taskType, candidate.taskType),
            eq(aiGenerationCandidates.userSelected, 1),
          ),
        )
    }

    // Mark this candidate as selected
    const [updated] = await db.update(aiGenerationCandidates)
      .set({ userSelected: 1, updatedAt: now() })
      .where(eq(aiGenerationCandidates.id, candidateId))
      .returning()

    return updated ?? null
  }

  static async rateCandidate(projectId: string, candidateId: string, rating: number) {
    const [updated] = await db.update(aiGenerationCandidates)
      .set({ userRating: rating, updatedAt: now() })
      .where(
        and(eq(aiGenerationCandidates.id, candidateId), eq(aiGenerationCandidates.projectId, projectId)),
      )
      .returning()

    return updated ?? null
  }

  static async createCandidate(projectId: string, data: CreateAICandidateInput) {
    const id = generateId()
    const timestamp = now()
    const [row] = await db.insert(aiGenerationCandidates).values({
      id,
      projectId,
      chapterId: data.chapterId ?? null,
      contextSnapshotId: data.contextSnapshotId ?? null,
      provider: data.provider,
      model: data.model,
      taskType: data.taskType,
      content: data.content,
      qualityScore: data.qualityScore ?? null,
      userSelected: 0,
      userRating: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    }).returning()

    return row
  }
}
