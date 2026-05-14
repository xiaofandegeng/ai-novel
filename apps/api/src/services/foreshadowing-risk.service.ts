import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions'
import { and, asc, eq } from 'drizzle-orm'
import { db } from '../db'
import { chapters } from '../db/schema/chapter'
import { foreshadowingItems } from '../db/schema/postprocess'
import { novelProjects } from '../db/schema/project'
import { callAIJSON } from './ai.service'

interface ForeshadowingRisk {
  id: string
  title: string
  status: string
  importance: string
  setupChapterId: string | null
  setupChapterNumber: number | null
  expectedPayoffChapterId: string | null
  expectedPayoffChapterNumber: number | null
  payoffChapterId: string | null
  payoffChapterNumber: number | null
  riskType: 'overdue' | 'stagnant' | 'concentration' | 'continuity' | 'orphaned'
  riskLevel: 'high' | 'medium' | 'low'
  message: string
}

interface RiskReport {
  risks: ForeshadowingRisk[]
  summary: { high: number, medium: number, low: number }
}

interface PayoffSuggestion {
  suggestedChapter: string
  suggestedMethod: string
  reasoning: string
}

export class ForeshadowingRiskService {
  static async analyzeRisks(projectId: string): Promise<RiskReport> {
    const items = await db.select().from(foreshadowingItems).where(
      eq(foreshadowingItems.projectId, projectId),
    )

    const projectChapters = await db.select({
      id: chapters.id,
      chapterNumber: chapters.chapterNumber,
    }).from(chapters).where(
      eq(chapters.projectId, projectId),
    ).orderBy(asc(chapters.chapterNumber))

    const chapterMap = new Map(projectChapters.map(c => [c.id, c.chapterNumber]))
    const latestChapter = projectChapters.length > 0 ? projectChapters[projectChapters.length - 1].chapterNumber : 0

    const risks: ForeshadowingRisk[] = []

    for (const item of items) {
      const setupNum = item.setupChapterId ? chapterMap.get(item.setupChapterId) ?? null : null
      const expectedNum = item.expectedPayoffChapterId ? chapterMap.get(item.expectedPayoffChapterId) ?? null : null
      const payoffNum = item.payoffChapterId ? chapterMap.get(item.payoffChapterId) ?? null : null

      // Overdue: open/progressing and past expected payoff
      if ((item.status === 'open' || item.status === 'progressing') && expectedNum && latestChapter > expectedNum) {
        risks.push({
          id: item.id,
          title: item.title,
          status: item.status,
          importance: item.importance || 'normal',
          setupChapterId: item.setupChapterId,
          setupChapterNumber: setupNum,
          expectedPayoffChapterId: item.expectedPayoffChapterId,
          expectedPayoffChapterNumber: expectedNum,
          payoffChapterId: item.payoffChapterId,
          payoffChapterNumber: payoffNum,
          riskType: 'overdue',
          riskLevel: item.importance === 'major' ? 'high' : 'medium',
          message: `计划在第${expectedNum}章兑现，已超过${latestChapter - expectedNum}章`,
        })
      }

      // Stagnant: open with no status change for many chapters
      if (item.status === 'open' && setupNum && latestChapter - setupNum > 10) {
        risks.push({
          id: item.id,
          title: item.title,
          status: item.status,
          importance: item.importance || 'normal',
          setupChapterId: item.setupChapterId,
          setupChapterNumber: setupNum,
          expectedPayoffChapterId: item.expectedPayoffChapterId,
          expectedPayoffChapterNumber: expectedNum,
          payoffChapterId: item.payoffChapterId,
          payoffChapterNumber: payoffNum,
          riskType: 'stagnant',
          riskLevel: latestChapter - setupNum > 20 ? 'high' : 'medium',
          message: `埋设后已过${latestChapter - setupNum}章未推进`,
        })
      }

      // Orphaned: no setup chapter assigned
      if ((item.status === 'open' || item.status === 'progressing') && !item.setupChapterId) {
        risks.push({
          id: item.id,
          title: item.title,
          status: item.status,
          importance: item.importance || 'normal',
          setupChapterId: null,
          setupChapterNumber: null,
          expectedPayoffChapterId: item.expectedPayoffChapterId,
          expectedPayoffChapterNumber: expectedNum,
          payoffChapterId: item.payoffChapterId,
          payoffChapterNumber: payoffNum,
          riskType: 'orphaned',
          riskLevel: 'low',
          message: '未指定埋设章节',
        })
      }
    }

    // Concentration risk: too many payoffs expected in the same chapter
    const payoffByChapter = new Map<number, { title: string, importance: string }[]>()
    for (const item of items) {
      if (item.expectedPayoffChapterId) {
        const num = chapterMap.get(item.expectedPayoffChapterId)
        if (num) {
          const list = payoffByChapter.get(num) || []
          list.push({ title: item.title, importance: item.importance || 'normal' })
          payoffByChapter.set(num, list)
        }
      }
    }
    for (const [chapterNum, list] of payoffByChapter) {
      if (list.length >= 3) {
        const majorCount = list.filter(i => i.importance === 'major').length
        for (const entry of list) {
          risks.push({
            id: '',
            title: entry.title,
            status: 'open',
            importance: entry.importance,
            setupChapterId: null,
            setupChapterNumber: null,
            expectedPayoffChapterId: null,
            expectedPayoffChapterNumber: chapterNum,
            payoffChapterId: null,
            payoffChapterNumber: null,
            riskType: 'concentration',
            riskLevel: majorCount >= 2 ? 'high' : 'medium',
            message: `第${chapterNum}章预计有${list.length}条伏笔同时兑现`,
          })
        }
      }
    }

    return {
      risks,
      summary: {
        high: risks.filter(r => r.riskLevel === 'high').length,
        medium: risks.filter(r => r.riskLevel === 'medium').length,
        low: risks.filter(r => r.riskLevel === 'low').length,
      },
    }
  }

  static async suggestPayoff(projectId: string, foreshadowingId: string): Promise<PayoffSuggestion> {
    const [project] = await db.select({ title: novelProjects.title, genre: novelProjects.genre }).from(novelProjects).where(eq(novelProjects.id, projectId))
    if (!project)
      throw new Error('Project not found')

    const [item] = await db.select().from(foreshadowingItems).where(
      and(eq(foreshadowingItems.id, foreshadowingId), eq(foreshadowingItems.projectId, projectId)),
    )
    if (!item)
      throw new Error('Foreshadowing item not found')

    const messages: ChatCompletionMessageParam[] = [
      {
        role: 'system',
        content: '你是一位小说伏笔回收专家。根据伏笔信息和故事进度，建议最合适的兑现方式和时机。返回 JSON: { "suggestedChapter": "章节描述", "suggestedMethod": "兑现方式", "reasoning": "理由" }',
      },
      {
        role: 'user',
        content: `小说: ${project.title}${project.genre ? ` (${project.genre})` : ''}
伏笔: ${item.title}
描述: ${item.description || '无'}
状态: ${item.status}
重要性: ${item.importance || 'normal'}
备注: ${item.notes || '无'}

请给出伏笔兑现建议。`,
      },
    ]

    return callAIJSON<PayoffSuggestion>(messages, {
      metadata: { projectId, taskType: 'foreshadowing_payoff_suggestion' },
    })
  }
}
