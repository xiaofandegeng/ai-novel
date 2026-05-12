import type { KnowledgeContextSnippet } from '@ai-novel/shared'
import { and, eq, or, sql } from 'drizzle-orm'
import { db } from '../db'
import { knowledgeChunks, knowledgeEmbeddings, storyFactTriples } from '../db/schema'
import { buildEmbeddingText, cosineSimilarity, createLocalEmbedding, parseEmbedding } from './embedding.service'

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

async function keywordSearch(
  projectId: string,
  terms: string[],
): Promise<Array<{ id: string, title: string | null, summary: string | null, techniques: string | null, matchedTerms: string[] }>> {
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

interface SearchResult { id: string, title: string | null, summary: string | null, techniques: string | null, matchedTerms: string[], vectorScore?: number }

async function embeddingIndexSearch(
  projectId: string,
  terms: string[],
): Promise<SearchResult[]> {
  if (terms.length === 0)
    return []

  const rows = await db
    .select({
      id: knowledgeEmbeddings.id,
      summary: knowledgeEmbeddings.summary,
      tags: knowledgeEmbeddings.tags,
      embedding: knowledgeEmbeddings.embedding,
    })
    .from(knowledgeEmbeddings)
    .where(eq(knowledgeEmbeddings.projectId, projectId))
    .limit(200)

  const queryEmbedding = createLocalEmbedding(terms.join(' '))

  return rows
    .map((row) => {
      const existingEmbedding = parseEmbedding(row.embedding)
      const embedding = existingEmbedding || createLocalEmbedding(buildEmbeddingText({
        summary: row.summary,
        tags: row.tags,
      }))
      const vectorScore = cosineSimilarity(queryEmbedding, embedding)
      const matchedTerms = terms.filter((term) => {
        const pattern = term.toLowerCase()
        return (
          (row.summary?.toLowerCase().includes(pattern))
          || (row.tags?.toLowerCase().includes(pattern))
        )
      })
      return {
        id: row.id,
        title: null,
        summary: row.summary,
        techniques: row.tags,
        matchedTerms,
        vectorScore,
      }
    })
    .filter(row => row.vectorScore > 0.05 || row.matchedTerms.length > 0)
    .sort((a, b) => (b.vectorScore || 0) - (a.vectorScore || 0))
    .slice(0, 15)
}

function fuseResults(
  keywordResults: SearchResult[],
  expansionResults: SearchResult[],
  embeddingResults: SearchResult[],
  factExpansionTerms: string[],
  inputTerms: string[],
  characterNames: string[],
  conflictTitles: string[],
  limit: number,
): RetrievedKnowledge[] {
  const scoreMap = new Map<string, { result: SearchResult, score: number, reasons: Set<string> }>()

  function addResult(result: SearchResult, reason: string, weight: number) {
    const existing = scoreMap.get(result.id)
    if (existing) {
      existing.score += weight
      existing.reasons.add(reason)
    }
    else {
      scoreMap.set(result.id, { result, score: weight, reasons: new Set([reason]) })
    }
  }

  for (const r of keywordResults) {
    if (!r.summary)
      continue
    const baseScore = r.matchedTerms.length * 2
    addResult(r, `关键词匹配: ${r.matchedTerms.join(', ')}`, baseScore)

    // Boost if matches character names
    const charMatch = r.matchedTerms.some(t =>
      characterNames.some(name => name.includes(t) || t.includes(name)),
    )
    if (charMatch)
      addResult(r, '角色相关', 3)

    // Boost if matches conflict titles
    const conflictMatch = r.matchedTerms.some(t =>
      conflictTitles.some(title => title.includes(t) || t.includes(title)),
    )
    if (conflictMatch)
      addResult(r, '冲突相关', 2)
  }

  for (const r of expansionResults) {
    if (!r.summary)
      continue
    addResult(r, `事实图谱扩展: ${r.matchedTerms.join(', ')}`, r.matchedTerms.length)
  }

  for (const r of embeddingResults) {
    if (!r.summary)
      continue
    const vectorScore = r.vectorScore || 0
    const reason = r.matchedTerms.length > 0
      ? `向量检索 + 知识索引匹配: ${r.matchedTerms.join(', ')}`
      : `向量检索相似度: ${Math.round(vectorScore * 100)}`
    addResult(r, reason, Math.max(1, vectorScore * 8) + r.matchedTerms.length * 2)
  }

  return [...scoreMap.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ result, score, reasons }) => ({
      title: result.title || 'Knowledge Piece',
      summary: result.summary!,
      techniques: result.techniques || undefined,
      score,
      reasons: [...reasons],
    }))
}

export async function retrieveKnowledgeForAI(input: RetrievalInput): Promise<RetrievedKnowledge[]> {
  const { projectId, terms, characterNames, conflictTitles, factTripleSubjects, limit } = input

  if (terms.length === 0)
    return []

  // 1. Keyword search with primary terms
  const keywordResults = await keywordSearch(projectId, terms)

  // 2. Expand via confirmed fact triples
  const expansionTerms = await expandViaFactTriples(projectId, factTripleSubjects)
  const expansionResults = expansionTerms.length > 0
    ? await keywordSearch(projectId, expansionTerms.slice(0, 15))
    : []

  // 3. Embedding index search
  const embeddingResults = await embeddingIndexSearch(projectId, terms)

  // 4. Fuse and rank
  return fuseResults(keywordResults, expansionResults, embeddingResults, expansionTerms, terms, characterNames, conflictTitles, limit)
}
