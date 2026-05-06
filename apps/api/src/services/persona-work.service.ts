import { eq } from 'drizzle-orm'
import { db } from '../db'
import { referenceChapters, referenceWorks } from '../db/schema'
import { fail, generateId, now } from '../utils'

// ─── Reference Works ───

export async function listWorks(trainingSetId: string) {
  return db.select().from(referenceWorks).where(eq(referenceWorks.trainingSetId, trainingSetId))
}

export async function getWork(workId: string) {
  const [row] = await db.select().from(referenceWorks).where(eq(referenceWorks.id, workId))
  return row || null
}

export async function createWork(trainingSetId: string, input: { title: string, author?: string, sourceType?: 'webnovel' | 'reference' | 'sample', fileName?: string, fileSize?: number }) {
  const row = {
    id: generateId(),
    trainingSetId,
    title: input.title,
    author: input.author || null,
    sourceType: input.sourceType || 'webnovel' as const,
    fileName: input.fileName || null,
    fileSize: input.fileSize || null,
    status: 'uploaded' as const,
  }
  await db.insert(referenceWorks).values(row)
  return row
}

export async function deleteWork(workId: string) {
  const [row] = await db.delete(referenceWorks).where(eq(referenceWorks.id, workId)).returning()
  return row
}

// ─── Chapter Splitting ───

export async function splitWorkChapters(workId: string, content: string) {
  const work = await getWork(workId)
  if (!work)
    return fail('Work not found')

  await db.update(referenceWorks).set({ status: 'splitting', updatedAt: now() }).where(eq(referenceWorks.id, workId))

  try {
    const chapterPattern = /(第[一二三四五六七八九十百千万\d]+[章节卷篇]).*/g
    const matches = [...content.matchAll(chapterPattern)]

    const chapters: any[] = []

    if (matches.length > 0) {
      for (let i = 0; i < matches.length; i++) {
        const title = matches[i][0]
        const startIndex = matches[i].index!
        const endIndex = i < matches.length - 1 ? matches[i + 1].index! : content.length
        const chapterContent = content.substring(startIndex, endIndex).trim()

        chapters.push({
          id: generateId(),
          workId,
          trainingSetId: work.trainingSetId,
          title,
          chapterNumber: i + 1,
          content: chapterContent,
          wordCount: chapterContent.length,
        })
      }
    }
    else {
      chapters.push({
        id: generateId(),
        workId,
        trainingSetId: work.trainingSetId,
        title: '全文',
        chapterNumber: 1,
        content,
        wordCount: content.length,
      })
    }

    if (chapters.length > 0)
      await db.insert(referenceChapters).values(chapters)

    await db.update(referenceWorks).set({
      status: 'completed',
      wordCount: content.length,
      chapterCount: chapters.length,
      updatedAt: now(),
    }).where(eq(referenceWorks.id, workId))

    return { chapters: chapters.length }
  }
  catch (e: any) {
    await db.update(referenceWorks).set({ status: 'failed', updatedAt: now() }).where(eq(referenceWorks.id, workId))
    throw e
  }
}

export async function listWorkChapters(workId: string) {
  return db.select().from(referenceChapters).where(eq(referenceChapters.workId, workId))
}
