import type { KnowledgeContextSnippet } from '@ai-novel/shared'
import { and, eq, or, sql } from 'drizzle-orm'
import { db } from '../db'
import { chapterMemories, knowledgeChunks, storyFactTriples } from '../db/schema'
import { searchSimilarEmbeddings } from './embedding.service'

interface RetrievedKnowledge extends KnowledgeContextSnippet {
  score: number
  reasons: string[]
}

interface RetrievalInput {
  projectId: string
  terms: string[]
  characterNames: string[]
  conflictTitles: string[]
  factTripleSubjects: string[]
  limit: number
}

interface SearchResult {
  id: string
  title: string | null
  summary: string | null
  techniques: string | null
  matchedTerms: string[]
  vectorScore?: number
}

async function keywordSearch(
  projectId: string,
  terms: string[],
): Promise<SearchResult[]> {
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

  const rows = await db
    .select({
      id: knowledgeChunks.id,
      title: knowledgeChunks.title,
      summary: knowledgeChunks.summary,
      techniques: knowledgeChunks.techniques,
    })
    .from(knowledgeChunks)
    .where(and(
      eq(knowledgeChunks.projectId, projectId),
      or(...predicates),
    ))
    .limit(20)

  return rows.map(row => ({
    id: row.id,
    title: row.title,
    summary: row.summary,
    techniques: row.techniques,
    matchedTerms: terms.filter((term) => {
      const pattern = term.toLowerCase()
      return (
        (row.title?.toLowerCase().includes(pattern))
        || (row.summary?.toLowerCase().includes(pattern))
        || (row.techniques?.toLowerCase().includes(pattern))
      )
    }),
  }))
}

async function expandViaFactTriples(
  projectId: string,
  subjects: string[],
): Promise<string[]> {
  if (subjects.length === 0)
    return []

  const predicates = subjects.flatMap((name) => {
    const pattern = `%${name}%`
    return [
      sql`${storyFactTriples.subjectName} ILIKE ${pattern}`,
      sql`${storyFactTriples.objectName} ILIKE ${pattern}`,
    ]
  })

  const triples = await db
    .select({
      subjectName: storyFactTriples.subjectName,
      objectName: storyFactTriples.objectName,
      predicate: storyFactTriples.predicate,
    })
    .from(storyFactTriples)
    .where(and(
      eq(storyFactTriples.projectId, projectId),
      eq(storyFactTriples.status, 'confirmed'),
      or(...predicates),
    ))
    .limit(30)

  const expanded = new Set<string>()
  for (const t of triples) {
    expanded.add(t.objectName)
    expanded.add(t.subjectName)
    const parts = t.predicate.split(/[/、，,\s]+/).filter(p => p.length >= 2)
    for (const p of parts)
      expanded.add(p)
  }
  return [...expanded]
}

async function embeddingIndexSearch(
  projectId: string,
  query: string,
): Promise<SearchResult[]> {
  const similiarRows = await searchSimilarEmbeddings({
    projectId,
    query,
    limit: 20,
  })

  if (similiarRows.length === 0)
    return []

  // Collect IDs by content type for batch fetching
  const chunkIds = similiarRows.filter(r => r.contentType === 'knowledge_summary' || r.contentType === 'technique').map(r => r.chunkId).filter(Boolean) as string[]
  const memoryIds = similiarRows.filter(r => r.contentType === 'chapter_memory').map(r => r.chunkId).filter(Boolean) as string[]

  const [chunks, memories] = await Promise.all([
    chunkIds.length > 0 ? db.select().from(knowledgeChunks).where(and(eq(knowledgeChunks.projectId, projectId), sql`${knowledgeChunks.id} IN ${chunkIds}`)) : [],
    memoryIds.length > 0 ? db.select().from(chapterMemories).where(and(eq(chapterMemories.projectId, projectId), sql`${chapterMemories.id} IN ${memoryIds}`)) : [],
  ])

  // Simple map for mapping back
  const chunkMap = new Map(chunks.map(c => [c.id, c]))
  const memoryMap = new Map(memories.map(m => [m.id, m]))

  const results: SearchResult[] = []

  for (const r of similiarRows) {
    if (r.contentType === 'knowledge_summary' || r.contentType === 'technique') {
      const chunk = r.chunkId ? chunkMap.get(r.chunkId) : null
      if (chunk) {
        results.push({
          id: r.id,
          title: chunk.title || '知识片段',
          summary: chunk.summary || chunk.content.substring(0, 200),
          techniques: chunk.techniques || null,
          matchedTerms: [],
          vectorScore: r.similarity,
        })
      }
    }
    else if (r.contentType === 'chapter_memory') {
      const memory = r.chunkId ? memoryMap.get(r.chunkId) : null
      if (memory) {
        results.push({
          id: r.id,
          title: `章节记忆: ${memory.chapterId}`,
          summary: memory.summary || '无摘要',
          techniques: memory.styleNotes || null,
          matchedTerms: [],
          vectorScore: r.similarity,
        })
      }
    }
    // Add persona/fact mapping if needed, or just use the embedding record if it stores enough info
  }

  return results
}

function fuseResults(
  keywordResults: SearchResult[],
  expansionResults: SearchResult[],
  embeddingResults: SearchResult[],
  limit: number,
): RetrievedKnowledge[] {
  const scoreMap = new Map<string, { result: SearchResult, keywordScore: number, vectorScore: number, graphScore: number, reasons: Set<string> }>()

  function ensureEntry(result: SearchResult) {
    if (!scoreMap.has(result.id)) {
      scoreMap.set(result.id, {
        result,
        keywordScore: 0,
        vectorScore: 0,
        graphScore: 0,
        reasons: new Set(),
      })
    }
    return scoreMap.get(result.id)!
  }

  for (const r of keywordResults) {
    const entry = ensureEntry(r)
    entry.keywordScore = Math.min(1, r.matchedTerms.length / 3)
    entry.reasons.add(`关键词匹配: ${r.matchedTerms.join(', ')}`)
  }

  for (const r of embeddingResults) {
    const entry = ensureEntry(r)
    entry.vectorScore = r.vectorScore || 0
    entry.reasons.add(`语义相关性: ${Math.round((r.vectorScore || 0) * 100)}%`)
  }

  for (const r of expansionResults) {
    const entry = ensureEntry(r)
    entry.graphScore = Math.min(1, r.matchedTerms.length / 2)
    entry.reasons.add(`图谱关联: ${r.matchedTerms.join(', ')}`)
  }

  return [...scoreMap.values()]
    .map(({ result, keywordScore, vectorScore, graphScore, reasons }) => ({
      title: result.title || '知识片段',
      summary: result.summary!,
      techniques: result.techniques || undefined,
      score: (keywordScore * 0.25) + (vectorScore * 0.45) + (graphScore * 0.20) + 0.10, // 0.10 as default project relevance
      reasons: [...reasons],
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
}

export async function retrieveKnowledgeForAI(input: RetrievalInput): Promise<RetrievedKnowledge[]> {
  const { projectId, terms, factTripleSubjects, limit } = input

  if (terms.length === 0)
    return []

  const keywordResults = await keywordSearch(projectId, terms)

  const expansionTerms = await expandViaFactTriples(projectId, factTripleSubjects)
  const expansionResults = expansionTerms.length > 0
    ? await keywordSearch(projectId, expansionTerms.slice(0, 15))
    : []

  const embeddingResults = await embeddingIndexSearch(projectId, terms.join(' '))

  return fuseResults(keywordResults, expansionResults, embeddingResults, limit)
}
