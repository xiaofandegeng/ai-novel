import crypto from 'node:crypto'
import { and, eq, sql } from 'drizzle-orm'
import { db } from '../db'
import { knowledgeEmbeddings } from '../db/schema'
import { generateId, now } from '../utils'
import { callAIEmbedding } from './ai.service'

export type EmbeddingContentType
  = | 'knowledge_summary'
    | 'technique'
    | 'chapter_memory'
    | 'fact_summary'
    | 'persona_memory'

export interface EmbeddingInput {
  projectId: string
  text: string
  contentType: EmbeddingContentType
  sourceId?: string
  chunkId?: string
}

/**
 * 计算文本哈希，用于幂等性校验
 */
function getContentHash(text: string): string {
  return crypto.createHash('sha256').update(text).digest('hex')
}

/**
 * 获取或创建向量嵌入
 */
export async function getOrCreateEmbedding(input: EmbeddingInput): Promise<number[]> {
  const contentHash = getContentHash(input.text)
  const model = 'text-embedding-3-small' // 暂时写死或从 settings 扩展

  // 1. 尝试从数据库查找已有记录
  const [existing] = await db
    .select()
    .from(knowledgeEmbeddings)
    .where(
      and(
        eq(knowledgeEmbeddings.projectId, input.projectId),
        eq(knowledgeEmbeddings.contentHash, contentHash),
        eq(knowledgeEmbeddings.embeddingModel, model),
      ),
    )

  if (existing && existing.embeddingVector) {
    return existing.embeddingVector as number[]
  }

  // 2. 调用 AI 生成向量
  const vector = await callAIEmbedding(input.text, { model })

  // 3. 存储到数据库
  const timestamp = now()
  await db.insert(knowledgeEmbeddings).values({
    id: generateId(),
    projectId: input.projectId,
    sourceId: input.sourceId,
    chunkId: input.chunkId,
    embeddingModel: model,
    embeddingVector: vector,
    contentType: input.contentType,
    contentHash,
    createdAt: timestamp,
    updatedAt: timestamp,
  }).onConflictDoUpdate({
    target: knowledgeEmbeddings.id,
    set: {
      embeddingVector: vector,
      updatedAt: timestamp,
    },
  })

  return vector
}

/**
 * 向量相似度检索
 */
export async function searchSimilarEmbeddings(params: {
  projectId: string
  query: string
  contentType?: EmbeddingContentType
  limit?: number
}) {
  const { projectId, query, contentType, limit = 5 } = params

  // 1. 生成查询向量
  const queryVector = await callAIEmbedding(query)

  // 2. 使用 pgvector 进行余弦相似度检索
  // 1 - (v1 <=> v2) = cosine similarity
  const vectorStr = `[${queryVector.join(',')}]`

  const queryBuilder = db
    .select({
      id: knowledgeEmbeddings.id,
      sourceId: knowledgeEmbeddings.sourceId,
      chunkId: knowledgeEmbeddings.chunkId,
      contentType: knowledgeEmbeddings.contentType,
      // 使用 pgvector 的 <=> 运算符（余弦距离）
      similarity: sql<number>`1 - (${knowledgeEmbeddings.embeddingVector} <=> ${vectorStr}::vector)`,
    })
    .from(knowledgeEmbeddings)
    .where(
      and(
        eq(knowledgeEmbeddings.projectId, projectId),
        contentType ? eq(knowledgeEmbeddings.contentType, contentType) : undefined,
      ),
    )
    .orderBy(sql`${knowledgeEmbeddings.embeddingVector} <=> ${vectorStr}::vector`)
    .limit(limit)

  return await queryBuilder
}
