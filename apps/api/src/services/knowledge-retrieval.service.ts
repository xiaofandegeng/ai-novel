import type { KnowledgeContextSnippet } from '@ai-novel/shared'
import { and, eq, or, sql } from 'drizzle-orm'
import { db } from '../db'
import { knowledgeChunks, storyFactTriples } from '../db/schema'
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
    limit: 15,
  })

  const chunkIds = similiarRows.map(r => r.chunkId).filter(Boolean) as string[]
  if (chunkIds.length === 0)
    return []

  const chunks = await db
    .select()
    .from(knowledgeChunks)
    .where(and(
      eq(knowledgeChunks.projectId, projectId),
      sql`${knowledgeChunks.id} IN ${chunkIds}`,
    ))

  const chunkMap = new Map(chunks.map(c => [c.id, c]))

  return similiarRows.map((r) => {
    const chunk = r.chunkId ? chunkMap.get(r.chunkId) : null
    return {
      id: r.id,
      title: chunk?.title || null,
      summary: chunk?.summary || null,
      techniques: chunk?.techniques || null,
      matchedTerms: [],
      vectorScore: r.similarity,
    }
  }).filter(r => r.summary !== null)
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
      score: (keywordScore * 0.3) + (vectorScore * 0.5) + (graphScore * 0.2),
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
