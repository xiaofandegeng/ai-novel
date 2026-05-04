import type { Hono } from 'hono'
import { and, desc, eq } from 'drizzle-orm'
import { db } from '../db'
import { aiContextSnapshots } from '../db/schema'
import { fail, success } from '../utils'

export function registerAIContextSnapshotRoutes(app: Hono) {
  app.get('/api/projects/:projectId/context-snapshots', async (c) => {
    const projectId = c.req.param('projectId')
    const rows = await db.select({
      id: aiContextSnapshots.id,
      projectId: aiContextSnapshots.projectId,
      chapterId: aiContextSnapshots.chapterId,
      scene: aiContextSnapshots.scene,
      requestId: aiContextSnapshots.requestId,
      modelProvider: aiContextSnapshots.modelProvider,
      modelName: aiContextSnapshots.modelName,
      tokenEstimate: aiContextSnapshots.tokenEstimate,
      createdAt: aiContextSnapshots.createdAt,
    }).from(aiContextSnapshots).where(eq(aiContextSnapshots.projectId, projectId)).orderBy(desc(aiContextSnapshots.createdAt)).limit(50)
    return c.json(success(rows))
  })

  app.get('/api/projects/:projectId/context-snapshots/:id', async (c) => {
    const projectId = c.req.param('projectId')
    const id = c.req.param('id')
    const [row] = await db.select().from(aiContextSnapshots).where(
      and(eq(aiContextSnapshots.id, id), eq(aiContextSnapshots.projectId, projectId)),
    )
    if (!row)
      return c.json(fail('Snapshot not found'), 404)
    return c.json(success(row))
  })
}
