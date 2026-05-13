import { and, eq, like, or } from 'drizzle-orm'
import { db } from '../db'
import { knowledgeChunks, knowledgeEmbeddings, knowledgeNotes, knowledgeSources } from '../db/schema'
import { fail, generateId, now } from '../utils'
import { callAIJSON } from './ai.service'
import { buildEmbeddingText, createLocalEmbedding, serializeEmbedding } from './embedding.service'

export async function listSources(projectId: string) {
  return db.select().from(knowledgeSources).where(eq(knowledgeSources.projectId, projectId))
}

export async function createSource(
  projectId: string,
  input: {
    title: string
    author?: string
    sourceType?: 'classic' | 'reference' | 'personal'
    fileName?: string
    fileSize?: number
  },
) {
  const newSource = {
    id: generateId(),
    projectId,
    title: input.title,
    author: input.author,
    sourceType: input.sourceType || 'classic',
    fileName: input.fileName,
    fileSize: input.fileSize,
    status: 'pending' as const,
  }

  await db.insert(knowledgeSources).values(newSource)
  return newSource
}

export async function getSourceDetail(projectId: string, sourceId: string) {
  const [source] = await db
    .select()
    .from(knowledgeSources)
    .where(and(eq(knowledgeSources.id, sourceId), eq(knowledgeSources.projectId, projectId)))

  if (!source) {
    return fail('Source not found')
  }

  const chunks = await db.select().from(knowledgeChunks).where(eq(knowledgeChunks.sourceId, sourceId))
  return { ...source, chunks }
}

async function analyzeChunkWithAI(chunkContent: string, chunkTitle: string): Promise<{ summary: string, techniques: string }> {
  const truncatedContent = chunkContent.length > 3000
    ? `${chunkContent.substring(0, 3000)}...(内容过长已截断)`
    : chunkContent

  const prompt = `你是一位专业的文学编辑。请分析以下文本片段，返回严格的 JSON 格式。

片段标题：${chunkTitle}
内容：
${truncatedContent}

请返回以下 JSON 格式（不要包含 markdown 代码块标记）：
{
  "summary": "100-200字的中文摘要，概括该片段的核心内容、情节推进和人物发展",
  "techniques": "100-200字的中文分析，提取该片段使用的写作技巧、叙事手法和可复用的结构建议"
}`

  const parsed = await callAIJSON<{ summary?: string, techniques?: string }>(
    [{ role: 'user', content: prompt }],
    { temperature: 30 },
  )

  return {
    summary: parsed.summary || '',
    techniques: parsed.techniques || '',
  }
}

export async function analyzeSource(projectId: string, sourceId: string, content: string) {
  if (!content) {
    return fail('No content to analyze')
  }

  // Verify source belongs to project
  const [source] = await db
    .select()
    .from(knowledgeSources)
    .where(and(eq(knowledgeSources.id, sourceId), eq(knowledgeSources.projectId, projectId)))

  if (!source) {
    return fail('Source not found')
  }

  // Update status to processing
  await db
    .update(knowledgeSources)
    .set({ status: 'processing', updatedAt: now() })
    .where(and(eq(knowledgeSources.id, sourceId), eq(knowledgeSources.projectId, projectId)))

  try {
    // Basic chapter splitting by regex
    const chapterPattern = /(?:第\s*)?[一二三四五六七八九十百千万\d]+\s*[章节卷篇].*/g
    const matches = [...content.matchAll(chapterPattern)]

    const chunksData: any[] = []

    if (matches.length > 0) {
      for (let i = 0; i < matches.length; i++) {
        const title = matches[i][0]
        const startIndex = matches[i].index!
        const endIndex = i < matches.length - 1 ? matches[i + 1].index! : content.length
        const chapterContent = content.substring(startIndex, endIndex).trim()

        const analysis = await analyzeChunkWithAI(chapterContent, title)

        chunksData.push({
          id: generateId(),
          sourceId,
          projectId,
          chunkType: 'chapter',
          title,
          content: chapterContent,
          summary: analysis.summary,
          techniques: analysis.techniques,
          orderIndex: i + 1,
        })
      }
    }
    else {
      // Split by approximate 3000-char segments for long texts
      const segmentSize = 3000
      const segments: { title: string, content: string }[] = []

      if (content.length <= segmentSize) {
        segments.push({ title: '全文', content })
      }
      else {
        for (let i = 0; i < content.length; i += segmentSize) {
          const segmentContent = content.substring(i, i + segmentSize)
          segments.push({
            title: `片段 ${Math.floor(i / segmentSize) + 1}`,
            content: segmentContent,
          })
        }
      }

      for (let i = 0; i < segments.length; i++) {
        const seg = segments[i]
        const analysis = await analyzeChunkWithAI(seg.content, seg.title)

        chunksData.push({
          id: generateId(),
          sourceId,
          projectId,
          chunkType: 'full',
          title: seg.title,
          content: seg.content,
          summary: analysis.summary,
          techniques: analysis.techniques,
          orderIndex: i + 1,
        })
      }
    }

    // Insert chunks
    if (chunksData.length > 0) {
      await db.insert(knowledgeChunks).values(chunksData)
    }

    // Insert embedding index rows
    const embeddingRows = chunksData
      .filter(chunk => chunk.summary || chunk.techniques)
      .map(chunk => ({
        id: generateId(),
        projectId,
        sourceType: 'knowledge_chunk',
        sourceId: chunk.id,
        embedding: serializeEmbedding(createLocalEmbedding(buildEmbeddingText({
          title: chunk.title,
          summary: chunk.summary,
          techniques: chunk.techniques,
        }))),
        summary: chunk.summary || null,
        tags: chunk.techniques || null,
      }))

    if (embeddingRows.length > 0)
      await db.insert(knowledgeEmbeddings).values(embeddingRows)

    // Update source to completed
    await db
      .update(knowledgeSources)
      .set({ status: 'completed', updatedAt: now() })
      .where(and(eq(knowledgeSources.id, sourceId), eq(knowledgeSources.projectId, projectId)))

    return { chunks: chunksData.length }
  }
  catch (e: any) {
    await db
      .update(knowledgeSources)
      .set({ status: 'failed', updatedAt: now() })
      .where(and(eq(knowledgeSources.id, sourceId), eq(knowledgeSources.projectId, projectId)))
    throw e
  }
}

export async function searchKnowledge(projectId: string, query: string) {
  if (!query.trim()) {
    return db
      .select()
      .from(knowledgeChunks)
      .where(eq(knowledgeChunks.projectId, projectId))
      .limit(10)
  }

  const keyword = `%${query}%`
  return db
    .select()
    .from(knowledgeChunks)
    .where(
      and(
        eq(knowledgeChunks.projectId, projectId),
        or(
          like(knowledgeChunks.title, keyword),
          like(knowledgeChunks.content, keyword),
          like(knowledgeChunks.summary, keyword),
          like(knowledgeChunks.techniques, keyword),
        ),
      ),
    )
    .limit(10)
}

export async function listNotes(projectId: string) {
  return db.select().from(knowledgeNotes).where(eq(knowledgeNotes.projectId, projectId))
}

export async function createNote(
  projectId: string,
  input: {
    title: string
    content: string
    sourceId?: string
    tags?: string
  },
) {
  if (input.sourceId) {
    const [source] = await db
      .select({ id: knowledgeSources.id })
      .from(knowledgeSources)
      .where(and(eq(knowledgeSources.id, input.sourceId), eq(knowledgeSources.projectId, projectId)))
    if (!source) {
      return fail('关联的知识源不属于当前项目')
    }
  }

  const note = {
    id: generateId(),
    projectId,
    sourceId: input.sourceId || null,
    title: input.title,
    content: input.content,
    tags: input.tags || null,
  }

  await db.insert(knowledgeNotes).values(note)
  return note
}
