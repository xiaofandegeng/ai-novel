import type { Hono } from 'hono'
import { randomUUID } from 'node:crypto'
import { desc, eq } from 'drizzle-orm'
import { db } from '../db'
import { chapters, qualityReports } from '../db/schema'

export function registerQualityRoutes(app: Hono) {
  // List reports
  app.get('/api/projects/:projectId/quality/reports', async (c) => {
    const projectId = c.req.param('projectId')
    const reports = await db.select()
      .from(qualityReports)
      .where(eq(qualityReports.projectId, projectId))
      .orderBy(desc(qualityReports.createdAt))
    return c.json({ success: true, data: reports })
  })

  // Run quality check for a chapter
  app.post('/api/projects/:projectId/chapters/:chapterId/quality-check', async (c) => {
    const projectId = c.req.param('projectId')
    const chapterId = c.req.param('chapterId')

    const [chapter] = await db.select().from(chapters).where(eq(chapters.id, chapterId))
    if (!chapter)
      return c.json({ success: false, error: 'Chapter not found' }, 404)
    if (!chapter.draft)
      return c.json({ success: false, error: 'Chapter has no draft' }, 400)

    // Mock AI Analysis (Step 8.1 says Score 0-100)
    // Normally we'd call an LLM here with a specific quality prompt
    const id = randomUUID()
    const mockReport = {
      id,
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
    return c.json({ success: true, data: mockReport })
  })

  // Get report detail
  app.get('/api/projects/:projectId/quality/reports/:id', async (c) => {
    const id = c.req.param('id')
    const [report] = await db.select().from(qualityReports).where(eq(qualityReports.id, id))
    if (!report)
      return c.json({ success: false, error: 'Report not found' }, 404)
    return c.json({ success: true, data: report })
  })
}
