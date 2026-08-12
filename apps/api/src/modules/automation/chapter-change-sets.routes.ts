import type { Hono } from 'hono'
import { httpCommandOptions } from '../../shared/http/command-options'
import {
  CHANGE_CHANGE_SET_COMMAND,
  CHANGE_CHANGE_SET_ITEM_COMMAND,
} from './chapter-change-set.eventing'
import {
  applyChangeSet,
  approveChangeSet,
  approveChangeSetItem,
  getChangeSetById,
  getChapterChangeSets,
  rejectChangeSet,
  rejectChangeSetItem,
} from './chapter-change-set.service'

export function registerChapterChangeSetRoutes(app: Hono) {
  // Get all change sets for a chapter
  app.get('/api/projects/:projectId/chapters/:chapterId/change-sets', async (c) => {
    const { projectId, chapterId } = c.req.param()
    const data = await getChapterChangeSets(projectId, chapterId)
    return c.json(data)
  })

  // Get specific change set with items
  app.get('/api/projects/:projectId/change-sets/:id', async (c) => {
    const { projectId, id } = c.req.param()
    const data = await getChangeSetById(projectId, id)
    if (!data)
      return c.json({ error: 'Not found' }, 404)
    return c.json(data)
  })

  // Approve a change set
  app.post('/api/projects/:projectId/change-sets/:id/approve', async (c) => {
    const { projectId, id } = c.req.param()
    await approveChangeSet(projectId, id, httpCommandOptions(c, CHANGE_CHANGE_SET_COMMAND, projectId, id, 'approve'))
    return c.json({ success: true })
  })

  // Reject a change set
  app.post('/api/projects/:projectId/change-sets/:id/reject', async (c) => {
    const { projectId, id } = c.req.param()
    await rejectChangeSet(projectId, id, httpCommandOptions(c, CHANGE_CHANGE_SET_COMMAND, projectId, id, 'reject'))
    return c.json({ success: true })
  })

  // Apply a change set
  app.post('/api/projects/:projectId/change-sets/:id/apply', async (c) => {
    const { projectId, id } = c.req.param()
    const result = await applyChangeSet(projectId, id, httpCommandOptions(c, CHANGE_CHANGE_SET_COMMAND, projectId, id, 'apply'))
    return c.json(result)
  })

  // Approve a specific item
  app.post('/api/projects/:projectId/change-sets/:id/items/:itemId/approve', async (c) => {
    const { projectId, id, itemId } = c.req.param()
    await approveChangeSetItem(projectId, id, itemId, httpCommandOptions(c, CHANGE_CHANGE_SET_ITEM_COMMAND, projectId, id, itemId, 'approve'))
    return c.json({ success: true })
  })

  // Reject a specific item
  app.post('/api/projects/:projectId/change-sets/:id/items/:itemId/reject', async (c) => {
    const { projectId, id, itemId } = c.req.param()
    await rejectChangeSetItem(projectId, id, itemId, httpCommandOptions(c, CHANGE_CHANGE_SET_ITEM_COMMAND, projectId, id, itemId, 'reject'))
    return c.json({ success: true })
  })
}
