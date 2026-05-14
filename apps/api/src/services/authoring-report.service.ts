import { and, eq, gte, lte, sql } from 'drizzle-orm'
import { db } from '../db'
import {
  aiQualityFeedback,
  aiUsageRecords,
  chapters,
  characterRelationships,
  characters,
  conflicts,
  foreshadowingItems,
  novelProjects,
} from '../db/schema'

export class AuthoringReportService {
  static async getWeeklyReport(projectId: string, startDate: Date, endDate: Date) {
    const startStr = startDate.toISOString()
    const endStr = endDate.toISOString()

    // Verify project exists
    const [_project] = await db.select().from(novelProjects).where(eq(novelProjects.id, projectId))
    if (!_project)
      throw new Error('Project not found')

    const projectChapters = await db
      .select({ draft: chapters.draft })
      .from(chapters)
      .where(
        and(
          eq(chapters.projectId, projectId),
          gte(chapters.updatedAt, startStr),
          lte(chapters.updatedAt, endStr),
        ),
      )

    const wordCount = projectChapters.reduce((acc, c) => acc + (c.draft?.length || 0), 0)

    // 2. Entities Added
    const newChars = await db
      .select({ count: sql<number>`count(*)` })
      .from(characters)
      .where(and(eq(characters.projectId, projectId), gte(characters.createdAt, startStr), lte(characters.createdAt, endStr)))

    const newRels = await db
      .select({ count: sql<number>`count(*)` })
      .from(characterRelationships)
      .where(and(eq(characterRelationships.projectId, projectId), gte(characterRelationships.createdAt, startStr), lte(characterRelationships.createdAt, endStr)))

    const newConflicts = await db
      .select({ count: sql<number>`count(*)` })
      .from(conflicts)
      .where(and(eq(conflicts.projectId, projectId), gte(conflicts.createdAt, startStr), lte(conflicts.createdAt, endStr)))

    const newForeshadowing = await db
      .select({ count: sql<number>`count(*)` })
      .from(foreshadowingItems)
      .where(and(eq(foreshadowingItems.projectId, projectId), gte(foreshadowingItems.createdAt, startStr), lte(foreshadowingItems.createdAt, endStr)))

    // 3. AI Usage
    const usage = await db
      .select({
        totalTokens: sql<number>`sum(${aiUsageRecords.totalTokens})`,
        avgLatency: sql<number>`avg(${aiUsageRecords.latencyMs})`,
        successCount: sql<number>`count(case when ${aiUsageRecords.status} = 'success' then 1 end)`,
        totalCount: sql<number>`count(*)`,
      })
      .from(aiUsageRecords)
      .where(and(eq(aiUsageRecords.projectId, projectId), gte(aiUsageRecords.createdAt, startStr), lte(aiUsageRecords.createdAt, endStr)))

    // 4. Acceptance Rate
    const feedback = await db
      .select({
        acceptedCount: sql<number>`sum(${aiQualityFeedback.accepted})`,
        totalCount: sql<number>`count(*)`,
      })
      .from(aiQualityFeedback)
      .where(and(eq(aiQualityFeedback.projectId, projectId), gte(aiQualityFeedback.createdAt, startStr), lte(aiQualityFeedback.createdAt, endStr)))

    return {
      projectId,
      startDate: startStr,
      endDate: endStr,
      wordCountAdded: wordCount,
      chaptersCompleted: projectChapters.length,
      entitiesAdded: {
        characters: Number(newChars[0]?.count || 0),
        relationships: Number(newRels[0]?.count || 0),
        conflicts: Number(newConflicts[0]?.count || 0),
        foreshadowing: Number(newForeshadowing[0]?.count || 0),
      },
      aiUsage: {
        totalTokens: Number(usage[0]?.totalTokens || 0),
        estimatedCost: 0, // Need pricing logic
        averageLatency: Math.round(Number(usage[0]?.avgLatency || 0)),
        successRate: usage[0]?.totalCount ? (Number(usage[0]?.successCount) / Number(usage[0]?.totalCount)) : 1,
        acceptanceRate: feedback[0]?.totalCount ? (Number(feedback[0]?.acceptedCount) / Number(feedback[0]?.totalCount)) : 0,
      },
    }
  }
}
