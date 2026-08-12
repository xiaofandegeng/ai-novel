import type { CreateAICandidateInput } from '@ai-novel/shared'
import type { AIOperationCommandOptions } from './ai-operations.commands'
import { and, desc, eq, isNull } from 'drizzle-orm'
import { db } from '../../db'
import { aiGenerationCandidates } from '../../db/schema'
import { commandBus } from '../../eventing-runtime'
import { generateId } from '../../shared/utils'
import { compactAIOperationPayload, dispatchAIOperationCommand } from './ai-operations.commands'
import { CHANGE_AI_OPERATION_COMMAND, RECORD_AI_OPERATION_COMMAND } from './ai-operations.eventing'

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

  static async selectCandidate(projectId: string, candidateId: string, options: AIOperationCommandOptions = {}) {
    // First clear any existing selection for this project/chapter scope
    const [candidate] = await db.select().from(aiGenerationCandidates).where(
      and(eq(aiGenerationCandidates.id, candidateId), eq(aiGenerationCandidates.projectId, projectId)),
    )
    if (!candidate)
      return null

    // Clear previous selections for the same chapter and task type
    const selected = await db.select().from(aiGenerationCandidates).where(and(
      eq(aiGenerationCandidates.projectId, projectId),
      candidate.chapterId ? eq(aiGenerationCandidates.chapterId, candidate.chapterId) : isNull(aiGenerationCandidates.chapterId),
      eq(aiGenerationCandidates.taskType, candidate.taskType),
      eq(aiGenerationCandidates.userSelected, 1),
    ))
    return commandBus.runAtomically(async () => {
      for (const current of selected.filter(row => row.id !== candidateId)) {
        await dispatchAIOperationCommand(CHANGE_AI_OPERATION_COMMAND, projectId, current.id, { kind: 'candidate', data: { userSelected: 0 } }, options.commandId ? { ...options, commandId: `${options.commandId}:clear:${current.id}` } : {})
      }
      return dispatchAIOperationCommand(CHANGE_AI_OPERATION_COMMAND, projectId, candidateId, { kind: 'candidate', data: { userSelected: 1 } }, options)
    })
  }

  static async rateCandidate(projectId: string, candidateId: string, rating: number, options: AIOperationCommandOptions = {}) {
    const [candidate] = await db.select({ id: aiGenerationCandidates.id }).from(aiGenerationCandidates).where(and(eq(aiGenerationCandidates.id, candidateId), eq(aiGenerationCandidates.projectId, projectId)))
    if (!candidate)
      return null
    return dispatchAIOperationCommand(CHANGE_AI_OPERATION_COMMAND, projectId, candidateId, { kind: 'candidate', data: { userRating: rating } }, options)
  }

  static async createCandidate(projectId: string, data: CreateAICandidateInput, options: AIOperationCommandOptions = {}) {
    const id = generateId()
    return dispatchAIOperationCommand(RECORD_AI_OPERATION_COMMAND, projectId, id, compactAIOperationPayload({ kind: 'candidate', data: {
      chapterId: data.chapterId ?? null,
      contextSnapshotId: data.contextSnapshotId ?? null,
      provider: data.provider,
      model: data.model,
      taskType: data.taskType,
      content: data.content,
      qualityScore: data.qualityScore ?? null,
      userSelected: 0,
      userRating: null,
    } }), options)
  }
}
