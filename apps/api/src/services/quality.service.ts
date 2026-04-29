import { and, desc, eq } from 'drizzle-orm'
import { db } from '../db'
import { chapters, qualityReports } from '../db/schema'
import { fail, generateId } from '../utils'

export async function listReports(projectId: string) {
  return db
    .select()
    .from(qualityReports)
    .where(eq(qualityReports.projectId, projectId))
    .orderBy(desc(qualityReports.createdAt))
}

export async function runChapterQualityCheck(projectId: string, chapterId: string) {
  const [chapter] = await db
    .select()
    .from(chapters)
    .where(and(eq(chapters.id, chapterId), eq(chapters.projectId, projectId)))

  if (!chapter) {
    return fail('Chapter not found')
  }

  if (!chapter.draft) {
    return fail('Chapter has no draft')
  }

  // Mock AI Analysis (Step 8.1 says Score 0-100)
  // Normally we'd call an LLM here with a specific quality prompt
  const mockReport = {
    id: generateId(),
    projectId,
    chapterId,
    scope: 'chapter' as const,
    score: Math.floor(Math.random() * 30) + 70, // 70-100
    rhythmScore: Math.floor(Math.random() * 5) + 5, // 5-10
    conflictScore: Math.floor(Math.random() * 5) + 5,
    logicScore: Math.floor(Math.random() * 5) + 5,
    characterScore: Math.floor(Math.random() * 5) + 5,
    styleScore: Math.floor(Math.random() * 5) + 5,
    issues: JSON.stringify(['Rhythm starts slow', 'Character motivation slightly unclear in middle']),
    suggestions: JSON.stringify(['Try shorter sentences near the peak', 'Add a bit more sensory detail to the mirror scene']),
  }

  await db.insert(qualityReports).values(mockReport)
  return mockReport
}

export async function getReport(projectId: string, reportId: string) {
  const [report] = await db
    .select()
    .from(qualityReports)
    .where(and(eq(qualityReports.id, reportId), eq(qualityReports.projectId, projectId)))

  if (!report) {
    return fail('Report not found')
  }

  return report
}
