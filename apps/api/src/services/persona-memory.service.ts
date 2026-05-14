import { and, eq, sql } from 'drizzle-orm'
import { db } from '../db'
import { chapters, personaMemoryCards, knowledgeEmbeddings } from '../db/schema'
import { generateId, now } from '../utils'
import { callAIJSON } from './ai.service'
import { getOrCreateEmbedding, searchSimilarEmbeddings } from './embedding.service'

export type MemoryCardType = 'technique' | 'style' | 'fingerprint' | 'pacing' | 'character_voice'

export async function createMemoryCard(projectId: string, input: {
  cardType: MemoryCardType
  content: string
  tags?: string
  personaId?: string
}) {
  const id = generateId()
  const timestamp = now()
  
  // 1. 生成向量嵌入
  let embeddingId: string | undefined
  try {
    const vector = await getOrCreateEmbedding({
      projectId,
      text: input.content,
      contentType: 'persona_memory',
      sourceId: id,
    })
    // 查找刚刚生成的 embedding ID
    // 实际上 getOrCreateEmbedding 应该返回记录或至少 ID
    // 我们在这里通过 contentHash 查找
    const [emb] = await db.select().from(knowledgeEmbeddings).where(
      and(
        eq(knowledgeEmbeddings.projectId, projectId),
        eq(knowledgeEmbeddings.sourceId, id)
      )
    )
    embeddingId = emb?.id
  } catch (err) {
    console.warn('Failed to generate embedding for persona memory card:', err)
  }

  const [row] = await db.insert(personaMemoryCards).values({
    id,
    projectId,
    personaId: input.personaId,
    cardType: input.cardType,
    content: input.content,
    tags: input.tags,
    embeddingId,
    createdAt: timestamp,
    updatedAt: timestamp,
  }).returning()

  return row
}

/**
 * 根据写作场景构建人格记忆上下文
 */
export async function buildPersonaMemoryContext(projectId: string, scene?: string, query?: string): Promise<string[]> {
  // 1. 基础筛选逻辑
  // scene=outline -> technique, pacing
  // scene=draft -> style, fingerprint, character_voice
  // scene=polish -> style, technique
  
  const typeFilters: MemoryCardType[] = []
  if (scene === 'outline') typeFilters.push('technique', 'pacing')
  else if (scene === 'draft') typeFilters.push('style', 'fingerprint', 'character_voice')
  else if (scene === 'polish') typeFilters.push('style', 'technique')
  else typeFilters.push('style', 'technique', 'fingerprint', 'pacing', 'character_voice')

  // 2. 检索逻辑
  let cards: any[] = []
  
  if (query) {
    // 向量检索
    try {
      const results = await searchSimilarEmbeddings({
        projectId,
        query,
        contentType: 'persona_memory',
        limit: 10,
      })
      
      const cardIds = results.map(r => r.sourceId).filter(Boolean) as string[]
      if (cardIds.length > 0) {
        cards = await db.select().from(personaMemoryCards).where(
          and(
            eq(personaMemoryCards.projectId, projectId),
            sql`${personaMemoryCards.id} IN ${cardIds}`
          )
        )
      }
    } catch (err) {
      // 降级到全量或关键词
      cards = await db.select().from(personaMemoryCards).where(eq(personaMemoryCards.projectId, projectId)).limit(20)
    }
  } else {
    cards = await db.select().from(personaMemoryCards).where(
      and(
        eq(personaMemoryCards.projectId, projectId),
        sql`${personaMemoryCards.cardType} IN ${typeFilters}`
      )
    ).limit(10)
  }

  if (cards.length === 0) return []

  const lines: string[] = ['### 写作人格记忆 (Persona Memory)']
  for (const card of cards) {
    const typeLabel = {
      technique: '写作技巧',
      style: '风格偏好',
      fingerprint: '指纹特征',
      pacing: '节奏控制',
      character_voice: '人物声线'
    }[card.cardType as MemoryCardType] || card.cardType
    
    lines.push(`- [${typeLabel}] ${card.content}`)
  }

  return lines
}

/**
 * 自动从章节中提取人格记忆卡
 */
export async function extractPersonaCardsFromChapter(projectId: string, chapterId: string) {
  const [chapter] = await db.select().from(chapters).where(and(eq(chapters.id, chapterId), eq(chapters.projectId, projectId)))
  if (!chapter || !chapter.draft) return []

  const prompt = `你是一位顶尖的文学风格分析专家。请分析以下小说章节的写作风格和技巧，提取 2-3 条“人格记忆卡”。
每条记忆卡应是抽象、可复用的写作指令（如：“善用视觉暂留式描写，在大动作间隙插入环境微细节”）。
不得包含具体的人物名、地名或故事情节。

章节内容：
${chapter.draft.substring(0, 3000)}

请返回 JSON 格式：
{
  "cards": [
    { "type": "technique" | "style" | "fingerprint" | "pacing" | "character_voice", "content": "..." }
  ]
}`

  const parsed = await callAIJSON<{ cards: Array<{ type: string, content: string }> }>(
    [{ role: 'user', content: prompt }],
    { temperature: 30 }
  )

  const created = []
  for (const card of parsed.cards || []) {
    const row = await createMemoryCard(projectId, {
      cardType: card.type as MemoryCardType,
      content: card.content,
    })
    created.push(row)
  }

  return created
}

/**
 * 获取人格记忆片段 (兼容旧接口)
 */
export async function getFragments(projectId: string, fragmentType?: string) {
  let q = db.select().from(personaMemoryCards).where(eq(personaMemoryCards.projectId, projectId))
  
  if (fragmentType) {
    const typeMap: Record<string, any> = {
      style_pattern: 'style',
      dialogue_pattern: 'character_voice',
      narrative_preference: 'technique',
      vocabulary_tendency: 'fingerprint',
      pacing_preference: 'pacing'
    }
    const newType = typeMap[fragmentType] || fragmentType
    q = db.select().from(personaMemoryCards).where(
      and(eq(personaMemoryCards.projectId, projectId), eq(personaMemoryCards.cardType, newType))
    )
  }

  const rows = await q
  return rows.map(row => ({
    id: row.id,
    projectId: row.projectId,
    fragmentType: row.cardType,
    content: row.content,
    confidence: 100,
    sourceType: 'ai_extracted',
    createdAt: row.createdAt
  }))
}

/**
 * 提取风格模式 (兼容旧接口)
 */
export async function extractStylePatterns(projectId: string, chapterIds?: string[]) {
  if (!chapterIds || chapterIds.length === 0) return []
  
  const created = []
  for (const cid of chapterIds) {
    const cards = await extractPersonaCardsFromChapter(projectId, cid)
    created.push(...cards)
  }
  
  return created.map(row => ({
    id: row.id,
    projectId: row.projectId,
    fragmentType: row.cardType,
    content: row.content,
    confidence: 100,
    sourceType: 'ai_extracted',
    createdAt: row.createdAt
  }))
}
