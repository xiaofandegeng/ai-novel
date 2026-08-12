import type { ChapterMemory } from '@ai-novel/shared'
import { and, eq } from 'drizzle-orm'
import { db } from '../../db'
import { chapterMemories, chapterPostprocessRuns } from '../../db/schema'

export async function getChapterMemory(projectId: string, chapterId: string): Promise<ChapterMemory | null> {
  const [row] = await db.select().from(chapterMemories).where(and(
    eq(chapterMemories.projectId, projectId),
    eq(chapterMemories.chapterId, chapterId),
  ))
  return row || null
}

export function getProjectMemories(projectId: string): Promise<ChapterMemory[]> {
  return db.select().from(chapterMemories).where(eq(chapterMemories.projectId, projectId))
}

export function getPostprocessRuns(projectId: string, chapterId: string) {
  return db.select().from(chapterPostprocessRuns).where(and(
    eq(chapterPostprocessRuns.projectId, projectId),
    eq(chapterPostprocessRuns.chapterId, chapterId),
  ))
}
