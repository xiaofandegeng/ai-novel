import { and, asc, desc, eq, gte, lte } from 'drizzle-orm'
import { db } from '../db'
import { dailyWritingStats, writingGoals } from '../db/schema/writing-goals'
import { generateId, now } from '../utils'

export class WritingGoalsService {
  static async getGoals(projectId: string) {
    return db.select().from(writingGoals).where(
      eq(writingGoals.projectId, projectId),
    ).orderBy(desc(writingGoals.status), desc(writingGoals.createdAt))
  }

  static async getActiveGoals(projectId: string) {
    return db.select().from(writingGoals).where(
      and(eq(writingGoals.projectId, projectId), eq(writingGoals.status, 'active')),
    )
  }

  static async createGoal(projectId: string, data: {
    goalType: string
    targetWords?: number
    targetChapters?: number
    startDate: string
    endDate?: string
    status?: string
  }) {
    const id = generateId()
    const [row] = await db.insert(writingGoals).values({
      id,
      projectId,
      goalType: data.goalType as 'daily_words' | 'weekly_words' | 'chapters' | 'completion_date',
      targetWords: data.targetWords ?? null,
      targetChapters: data.targetChapters ?? null,
      startDate: data.startDate,
      endDate: data.endDate ?? null,
      status: (data.status as 'active' | 'completed' | 'abandoned') || 'active',
      updatedAt: now(),
    }).returning()
    return row
  }

  static async updateGoal(projectId: string, goalId: string, data: Record<string, any>) {
    const fields: Record<string, any> = { updatedAt: now() }
    if (data.goalType !== undefined)
      fields.goalType = data.goalType
    if (data.targetWords !== undefined)
      fields.targetWords = data.targetWords
    if (data.targetChapters !== undefined)
      fields.targetChapters = data.targetChapters
    if (data.startDate !== undefined)
      fields.startDate = data.startDate
    if (data.endDate !== undefined)
      fields.endDate = data.endDate
    if (data.status !== undefined)
      fields.status = data.status

    const [row] = await db.update(writingGoals).set(fields).where(
      and(eq(writingGoals.id, goalId), eq(writingGoals.projectId, projectId)),
    ).returning()
    return row
  }

  static async deleteGoal(projectId: string, goalId: string) {
    const [row] = await db.delete(writingGoals).where(
      and(eq(writingGoals.id, goalId), eq(writingGoals.projectId, projectId)),
    ).returning()
    return row
  }

  static async getGoalProgress(projectId: string, goalId: string) {
    const [goal] = await db.select().from(writingGoals).where(
      and(eq(writingGoals.id, goalId), eq(writingGoals.projectId, projectId)),
    )
    if (!goal)
      return null

    const conditions = [eq(dailyWritingStats.projectId, projectId)]
    conditions.push(gte(dailyWritingStats.date, goal.startDate))
    if (goal.endDate)
      conditions.push(lte(dailyWritingStats.date, goal.endDate))

    const stats = await db.select().from(dailyWritingStats).where(
      and(...conditions),
    )

    const currentWords = stats.reduce((sum, s) => sum + s.wordsAdded, 0)
    const currentChapters = stats.reduce((sum, s) => sum + s.chaptersCompleted, 0)

    const target = goal.goalType === 'chapters'
      ? (goal.targetChapters || 1)
      : (goal.targetWords || 1)

    const current = goal.goalType === 'chapters' ? currentChapters : currentWords
    const percentage = Math.min(Math.round((current / target) * 100), 100)

    const today = new Date()
    const endDate = goal.endDate ? new Date(goal.endDate) : null
    const daysRemaining = endDate
      ? Math.max(0, Math.ceil((endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)))
      : 0

    const dailyTarget = goal.goalType === 'chapters'
      ? (daysRemaining > 0 ? Math.ceil(((goal.targetChapters || 0) - currentChapters) / daysRemaining) : 0)
      : (daysRemaining > 0 ? Math.ceil(((goal.targetWords || 0) - currentWords) / daysRemaining) : 0)

    return {
      goal,
      currentWords,
      currentChapters,
      percentage,
      daysRemaining,
      dailyTarget,
    }
  }

  static async getDailyStats(projectId: string, startDate?: string, endDate?: string) {
    const conditions = [eq(dailyWritingStats.projectId, projectId)]
    if (startDate)
      conditions.push(gte(dailyWritingStats.date, startDate))
    if (endDate)
      conditions.push(lte(dailyWritingStats.date, endDate))

    return db.select().from(dailyWritingStats).where(
      and(...conditions),
    ).orderBy(asc(dailyWritingStats.date))
  }

  static async recordWritingActivity(projectId: string, data: {
    date: string
    wordsAdded?: number
    chaptersCompleted?: number
    aiWordsAccepted?: number
    manualWordsAdded?: number
  }) {
    const existing = await db.select().from(dailyWritingStats).where(
      and(eq(dailyWritingStats.projectId, projectId), eq(dailyWritingStats.date, data.date)),
    )

    if (existing.length > 0) {
      const row = existing[0]
      const [updated] = await db.update(dailyWritingStats).set({
        wordsAdded: row.wordsAdded + (data.wordsAdded || 0),
        chaptersCompleted: row.chaptersCompleted + (data.chaptersCompleted || 0),
        aiWordsAccepted: row.aiWordsAccepted + (data.aiWordsAccepted || 0),
        manualWordsAdded: row.manualWordsAdded + (data.manualWordsAdded || 0),
      }).where(eq(dailyWritingStats.id, row.id)).returning()
      return updated
    }

    const id = generateId()
    const [row] = await db.insert(dailyWritingStats).values({
      id,
      projectId,
      date: data.date,
      wordsAdded: data.wordsAdded || 0,
      chaptersCompleted: data.chaptersCompleted || 0,
      aiWordsAccepted: data.aiWordsAccepted || 0,
      manualWordsAdded: data.manualWordsAdded || 0,
    }).returning()
    return row
  }
}
