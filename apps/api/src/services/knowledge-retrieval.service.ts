import type { KnowledgeContextSnippet } from '@ai-novel/shared'
import { and, eq, inArray, or, sql } from 'drizzle-orm'
import { db } from '../db'
import { chapterMemories, characters, knowledgeChunks, storyBibles } from '../db/schema'
import { searchSimilarEmbeddings } from './embedding.service'

export interface RetrievedKnowledge extends KnowledgeContextSnippet {
  id: string
  score: number
  reasons: string[]
  source: 'knowledge' | 'memory' | 'bible' | 'character' | 'fact'
  scoreBreakdown: {
    keyword: number
    vector: number
    recency: number
    importance: number
  }
}

export interface RetrievalInput {
  projectId: string
  terms: string[]
  factTripleSubjects: string[]
  limit?: number
}

interface SearchResult {
  id: string
  title: string | null
  summary: string | null
  techniques: string | null
  source: RetrievedKnowledge['source']
  matchedTerms: string[]
  vectorScore: number
  importance: number
  createdAt: Date
}

export class KnowledgeRetrievalService {
  private static async keywordSearch(projectId: string, terms: string[]): Promise<SearchResult[]> {
    if (terms.length === 0)
      return []

    const predicates = terms.flatMap((term) => {
      const pattern = `%${term}%`
      return [
        sql`${knowledgeChunks.title} ILIKE ${pattern}`,
        sql`${knowledgeChunks.summary} ILIKE ${pattern}`,
        sql`${knowledgeChunks.techniques} ILIKE ${pattern}`,
      ]
    })

    const [knowledgeRows, memoryRows] = await Promise.all([
      db
        .select({
          id: knowledgeChunks.id,
          title: knowledgeChunks.title,
          summary: knowledgeChunks.summary,
          techniques: knowledgeChunks.techniques,
          importance: knowledgeChunks.importance,
          createdAt: knowledgeChunks.createdAt,
        })
        .from(knowledgeChunks)
        .where(and(eq(knowledgeChunks.projectId, projectId), or(...predicates)))
        .limit(20),
      db
        .select({
          id: chapterMemories.id,
          chapterId: chapterMemories.chapterId,
          summary: chapterMemories.summary,
          createdAt: chapterMemories.createdAt,
        })
        .from(chapterMemories)
        .where(and(eq(chapterMemories.projectId, projectId), sql`${chapterMemories.summary} ILIKE ANY(${terms.map(t => `%${t}%`)})`))
        .limit(10),
    ])

    const results: SearchResult[] = []

    knowledgeRows.forEach(row => results.push({
      id: row.id,
      title: row.title,
      summary: row.summary,
      techniques: row.techniques,
      source: 'knowledge',
      matchedTerms: terms.filter(t => (row.title?.includes(t) || row.summary?.includes(t))),
      vectorScore: 0,
      importance: row.importance || 5,
      createdAt: new Date(row.createdAt),
    }))

    memoryRows.forEach(row => results.push({
      id: row.id,
      title: `章节记忆: 第 ${row.chapterId} 卷/章`,
      summary: row.summary,
      techniques: null,
      source: 'memory',
      matchedTerms: terms.filter(t => row.summary?.includes(t)),
      vectorScore: 0,
      importance: 7,
      createdAt: new Date(row.createdAt),
    }))

    return results
  }

  /**
   * 向量搜索
   */
  private static async vectorSearch(projectId: string, query: string): Promise<SearchResult[]> {
    const similar = await searchSimilarEmbeddings({ projectId, query, limit: 30 })
    if (similar.length === 0)
      return []

    const chunkIds = similar.filter(s => s.contentType === 'knowledge_summary').map(s => s.chunkId).filter(Boolean) as string[]
    const memoryIds = similar.filter(s => s.contentType === 'chapter_memory').map(s => s.chunkId).filter(Boolean) as string[]

    const [chunks, memories] = await Promise.all([
      chunkIds.length > 0
        ? db.select().from(knowledgeChunks).where(and(
            eq(knowledgeChunks.projectId, projectId),
            inArray(knowledgeChunks.id, chunkIds),
          ))
        : [],
      memoryIds.length > 0
        ? db.select().from(chapterMemories).where(and(
            eq(chapterMemories.projectId, projectId),
            inArray(chapterMemories.id, memoryIds),
          ))
        : [],
    ])

    const results: SearchResult[] = []
    const chunkMap = new Map(chunks.map(c => [c.id, c]))
    const memoryMap = new Map(memories.map(m => [m.id, m]))

    for (const s of similar) {
      if (s.contentType === 'knowledge_summary' && s.chunkId) {
        const c = chunkMap.get(s.chunkId)
        if (c && c.summary) {
          results.push({
            id: c.id,
            title: c.title,
            summary: c.summary,
            techniques: c.techniques,
            source: 'knowledge',
            matchedTerms: [],
            vectorScore: s.similarity,
            importance: c.importance || 5,
            createdAt: new Date(c.createdAt),
          })
        }
      }
      else if (s.contentType === 'chapter_memory' && s.chunkId) {
        const m = memoryMap.get(s.chunkId)
        if (m && m.summary) {
          results.push({
            id: m.id,
            title: `章节记忆: 第 ${m.chapterId} 卷/章`,
            summary: m.summary,
            techniques: m.styleNotes,
            source: 'memory',
            matchedTerms: [],
            vectorScore: s.similarity,
            importance: 7,
            createdAt: new Date(m.createdAt),
          })
        }
      }
    }

    return results
  }

  /**
   * 搜索角色设定
   */
  private static async searchCharacters(projectId: string, terms: string[]): Promise<SearchResult[]> {
    if (terms.length === 0)
      return []
    const predicates = terms.map(t => sql`${characters.name} ILIKE ${`%${t}%`}`)

    const rows = await db.select().from(characters).where(and(eq(characters.projectId, projectId), or(...predicates))).limit(5)

    return rows.map(r => ({
      id: r.id,
      title: `人物设定: ${r.name}`,
      summary: `角色: ${r.role || '未定'}. 性格: ${r.personality || '未定'}. 目标: ${r.goal || '未定'}`,
      techniques: null,
      source: 'character',
      matchedTerms: terms.filter(t => r.name.includes(t)),
      vectorScore: 0,
      importance: 9, // 角色设定极高重要性
      createdAt: new Date(r.createdAt),
    }))
  }

  /**
   * 搜索世界观规则
   */
  private static async searchStoryBible(projectId: string, terms: string[]): Promise<SearchResult[]> {
    const bible = await db.select().from(storyBibles).where(eq(storyBibles.projectId, projectId)).limit(1)
    if (bible.length === 0)
      return []

    const b = bible[0]
    const matchedTerms = terms.filter(t => b.rules?.includes(t) || b.worldview?.includes(t))
    if (matchedTerms.length === 0)
      return []

    return [{
      id: b.id,
      title: '世界观规则/设定',
      summary: b.rules || b.worldview || '',
      techniques: null,
      source: 'bible',
      matchedTerms,
      vectorScore: 0,
      importance: 10,
      createdAt: new Date(b.createdAt),
    }]
  }

  /**
   * 综合评分融合 (RRF 变体 + 加权分数)
   */
  private static fuse(
    keywordResults: SearchResult[],
    vectorResults: SearchResult[],
    characterResults: SearchResult[],
    bibleResults: SearchResult[],
    limit: number,
  ): RetrievedKnowledge[] {
    const map = new Map<string, { res: SearchResult, kScore: number, vScore: number, rScore: number, iScore: number, reasons: Set<string> }>()
    const nowTs = Date.now()

    const ensure = (r: SearchResult) => {
      if (!map.has(r.id)) {
        // 计算时间衰减分 (Recency: 20%)
        // 1小时内 1.0, 30天后 0.0
        const ageHours = (nowTs - r.createdAt.getTime()) / (1000 * 60 * 60)
        const recency = Math.max(0, 1 - (ageHours / (24 * 30)))

        map.set(r.id, {
          res: r,
          kScore: 0,
          vScore: 0,
          rScore: recency,
          iScore: r.importance / 10,
          reasons: new Set(),
        })
      }
      return map.get(r.id)!
    }

    keywordResults.forEach((r) => {
      const e = ensure(r)
      e.kScore = Math.min(1, r.matchedTerms.length / 2)
      e.reasons.add(`关键词命中: ${r.matchedTerms.join(', ')}`)
    })

    vectorResults.forEach((r) => {
      const e = ensure(r)
      e.vScore = Math.max(e.vScore, r.vectorScore)
      e.reasons.add(`语义相关性: ${Math.round(r.vectorScore * 100)}%`)
    })

    characterResults.forEach((r) => {
      const e = ensure(r)
      e.kScore = 1.0
      e.reasons.add(`人物关键匹配`)
    })

    bibleResults.forEach((r) => {
      const e = ensure(r)
      e.kScore = 1.0
      e.reasons.add(`世界观匹配`)
    })

    return [...map.values()].map(({ res, kScore, vScore, rScore, iScore, reasons }) => {
      // 权重: Keyword(45%) + Vector(25%) + Recency(20%) + Importance(10%)
      const finalScore = (kScore * 0.45) + (vScore * 0.25) + (rScore * 0.20) + (iScore * 0.10)

      return {
        id: res.id,
        title: res.title || '无标题',
        summary: res.summary || '',
        techniques: res.techniques || undefined,
        score: finalScore,
        reasons: [...reasons],
        source: res.source,
        scoreBreakdown: {
          keyword: kScore,
          vector: vScore,
          recency: rScore,
          importance: iScore,
        },
      }
    }).sort((a, b) => b.score - a.score).slice(0, limit)
  }

  /**
   * AI 上下文检索入口
   */
  public static async retrieve(input: RetrievalInput): Promise<RetrievedKnowledge[]> {
    const { projectId, terms, limit = 10 } = input
    if (terms.length === 0)
      return []

    const [keyword, vector, characters, bible] = await Promise.all([
      this.keywordSearch(projectId, terms),
      this.vectorSearch(projectId, terms.join(' ')),
      this.searchCharacters(projectId, terms),
      this.searchStoryBible(projectId, terms),
    ])

    return this.fuse(keyword, vector, characters, bible, limit)
  }
}

/**
 * 保持向后兼容的导出函数
 */
export async function retrieveKnowledgeForAI(input: RetrievalInput): Promise<RetrievedKnowledge[]> {
  return KnowledgeRetrievalService.retrieve(input)
}
