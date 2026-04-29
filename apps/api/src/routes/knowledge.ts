import type { Hono } from 'hono'
import { randomUUID } from 'node:crypto'
import { and, eq, like } from 'drizzle-orm'
import { db } from '../db'
import { knowledgeChunks, knowledgeNotes, knowledgeSources } from '../db/schema'

export function registerKnowledgeRoutes(app: Hono) {
  // List knowledge sources
  app.get('/api/projects/:projectId/knowledge/sources', async (c) => {
    const projectId = c.req.param('projectId')
    const sources = await db.select().from(knowledgeSources).where(eq(knowledgeSources.projectId, projectId))
    return c.json({ success: true, data: sources })
  })

  // Create knowledge source
  app.post('/api/projects/:projectId/knowledge/sources', async (c) => {
    const projectId = c.req.param('projectId')
    const body = await c.req.json()
    const id = randomUUID()

    const newSource = {
      id,
      projectId,
      title: body.title,
      author: body.author,
      sourceType: body.sourceType || 'classic',
      fileName: body.fileName,
      fileSize: body.fileSize,
      status: 'pending' as const,
    }

    await db.insert(knowledgeSources).values(newSource)
    return c.json({ success: true, data: newSource })
  })

  // Get source details with chunks
  app.get('/api/projects/:projectId/knowledge/sources/:id', async (c) => {
    const id = c.req.param('id')
    const projectId = c.req.param('projectId')
    const [source] = await db.select().from(knowledgeSources).where(and(eq(knowledgeSources.id, id), eq(knowledgeSources.projectId, projectId)))

    if (!source)
      return c.json({ success: false, error: 'Source not found' }, 404)

    const chunks = await db.select().from(knowledgeChunks).where(eq(knowledgeChunks.sourceId, id))
    return c.json({ success: true, data: { ...source, chunks } })
  })

  // MVP Analyze (Chapter split by regex)
  app.post('/api/projects/:projectId/knowledge/sources/:id/analyze', async (c) => {
    const id = c.req.param('id')
    const projectId = c.req.param('projectId')
    const { content } = await c.req.json() // Full text content for MVP

    if (!content)
      return c.json({ success: false, error: 'No content to analyze' }, 400)

    // Verify source belongs to project
    const [source] = await db.select().from(knowledgeSources).where(and(eq(knowledgeSources.id, id), eq(knowledgeSources.projectId, projectId)))
    if (!source)
      return c.json({ success: false, error: 'Source not found' }, 404)

    // Update status to processing
    await db.update(knowledgeSources).set({ status: 'processing' }).where(and(eq(knowledgeSources.id, id), eq(knowledgeSources.projectId, projectId)))

    try {
      // Basic chapter splitting by regex (Chapter/第X章/第X卷)
      const chapterPattern = /(第[一二三四五六七八九十百千万\d]+[章节卷篇]).*/g
      const matches = [...content.matchAll(chapterPattern)]

      const chunksData: any[] = []

      if (matches.length > 0) {
        for (let i = 0; i < matches.length; i++) {
          const title = matches[i][0]
          const startIndex = matches[i].index!
          const endIndex = i < matches.length - 1 ? matches[i + 1].index : content.length
          const chapterContent = content.substring(startIndex, endIndex).trim()

          chunksData.push({
            id: randomUUID(),
            sourceId: id,
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
          id: randomUUID(),
          sourceId: id,
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
      await db.update(knowledgeSources).set({ status: 'completed' }).where(and(eq(knowledgeSources.id, id), eq(knowledgeSources.projectId, projectId)))

      return c.json({ success: true, data: { chunks: chunksData.length } })
    }
    catch (e: any) {
      await db.update(knowledgeSources).set({ status: 'failed' }).where(and(eq(knowledgeSources.id, id), eq(knowledgeSources.projectId, projectId)))
      return c.json({ success: false, error: e.message }, 500)
    }
  })

  // Search knowledge
  app.get('/api/projects/:projectId/knowledge/search', async (c) => {
    const projectId = c.req.param('projectId')
    const query = c.req.query('q') || ''

    const results = await db.select()
      .from(knowledgeChunks)
      .where(
        and(
          eq(knowledgeChunks.projectId, projectId),
          like(knowledgeChunks.content, `%${query}%`),
        ),
      )
      .limit(10)

    return c.json({ success: true, data: results })
  })

  // Notes
  app.get('/api/projects/:projectId/knowledge/notes', async (c) => {
    const projectId = c.req.param('projectId')
    const notes = await db.select().from(knowledgeNotes).where(eq(knowledgeNotes.projectId, projectId))
    return c.json({ success: true, data: notes })
  })
}
