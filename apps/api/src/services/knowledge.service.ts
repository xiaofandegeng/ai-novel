import { and, eq, like } from 'drizzle-orm'
import { db } from '../db'
import { knowledgeChunks, knowledgeNotes, knowledgeSources } from '../db/schema'
import { fail, generateId, now } from '../utils'

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
    // Basic chapter splitting by regex (Chapter/第X章/第X卷)
    const chapterPattern = /(第[一二三四五六七八九十百千万\d]+[章节卷篇]).*/g
    const matches = [...content.matchAll(chapterPattern)]

    const chunksData: any[] = []

    if (matches.length > 0) {
      for (let i = 0; i < matches.length; i++) {
        const title = matches[i][0]
        const startIndex = matches[i].index!
        const endIndex = i < matches.length - 1 ? matches[i + 1].index! : content.length
        const chapterContent = content.substring(startIndex, endIndex).trim()

        chunksData.push({
          id: generateId(),
          sourceId,
          projectId,
          chunkType: 'chapter',
          title,
          content: chapterContent,
          summary: `Summary of ${title}`, // Mock summary for MVP
          orderIndex: i + 1,
        })
      }
    }
    else {
      // Just one big chunk if no chapters found
      chunksData.push({
        id: generateId(),
        sourceId,
        projectId,
        chunkType: 'full',
        title: 'Full Text',
        content,
        summary: 'Full text summary',
        orderIndex: 1,
      })
    }

    // Insert chunks
    if (chunksData.length > 0) {
      await db.insert(knowledgeChunks).values(chunksData)
    }

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
  return db
    .select()
    .from(knowledgeChunks)
    .where(
      and(
        eq(knowledgeChunks.projectId, projectId),
        like(knowledgeChunks.content, `%${query}%`),
      ),
    )
    .limit(10)
}

export async function listNotes(projectId: string) {
  return db.select().from(knowledgeNotes).where(eq(knowledgeNotes.projectId, projectId))
}
