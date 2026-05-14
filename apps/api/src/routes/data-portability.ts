import type { Hono } from 'hono'
import { exportProjectData, importProjectData } from '../services/export-import.service'
import {
  exportCharacterProfiles,
  exportConflictReport,
  exportForeshadowingReport,
  exportManuscriptMarkdown,
  exportManuscriptText,
  exportProjectProposal,
} from '../services/manuscript-export.service'
import { fail, success } from '../utils'

export function registerDataPortabilityRoutes(app: Hono) {
  // Existing full data export (JSON)
  app.get('/api/projects/:projectId/export', async (c) => {
    const projectId = c.req.param('projectId')
    const data = await exportProjectData(projectId)
    return c.json(success(data))
  })

  // Existing import
  app.post('/api/projects/import', async (c) => {
    const body = await c.req.json()
    if (!body.project)
      return c.json({ success: false, error: 'Invalid import data' }, 400)
    const result = await importProjectData(body)
    return c.json(success(result), 201)
  })

  // Manuscript export (MD or TXT)
  app.get('/api/projects/:projectId/export/manuscript', async (c) => {
    const projectId = c.req.param('projectId')
    const format = c.req.query('format') || 'md'
    const includeOutline = c.req.query('includeOutline') === 'true'
    const includeScenes = c.req.query('includeScenes') === 'true'
    const includeUnfinishedChapters = c.req.query('includeUnfinishedChapters') === 'true'
    const includeAuthorNotes = c.req.query('includeAuthorNotes') === 'true'

    const options = {
      includeOutline,
      includeScenes,
      includeUnfinishedChapters,
      includeAuthorNotes,
    }

    try {
      const result = format === 'txt'
        ? await exportManuscriptText(projectId, options)
        : await exportManuscriptMarkdown(projectId, options)

      return new Response(result.content, {
        headers: {
          'Content-Type': result.contentType,
          'Content-Disposition': `attachment; filename="${encodeURIComponent(result.filename)}"`,
        },
      })
    }
    catch (e: any) {
      return c.json(fail(e.message), 404)
    }
  })

  // Project proposal
  app.get('/api/projects/:projectId/export/proposal', async (c) => {
    const projectId = c.req.param('projectId')
    try {
      const result = await exportProjectProposal(projectId)
      return new Response(result.content, {
        headers: {
          'Content-Type': result.contentType,
          'Content-Disposition': `attachment; filename="${encodeURIComponent(result.filename)}"`,
        },
      })
    }
    catch (e: any) {
      return c.json(fail(e.message), 404)
    }
  })

  // Character profiles
  app.get('/api/projects/:projectId/export/characters', async (c) => {
    const projectId = c.req.param('projectId')
    try {
      const result = await exportCharacterProfiles(projectId)
      return new Response(result.content, {
        headers: {
          'Content-Type': result.contentType,
          'Content-Disposition': `attachment; filename="${encodeURIComponent(result.filename)}"`,
        },
      })
    }
    catch (e: any) {
      return c.json(fail(e.message), 404)
    }
  })

  // Foreshadowing report
  app.get('/api/projects/:projectId/export/foreshadowing-report', async (c) => {
    const projectId = c.req.param('projectId')
    try {
      const result = await exportForeshadowingReport(projectId)
      return new Response(result.content, {
        headers: {
          'Content-Type': result.contentType,
          'Content-Disposition': `attachment; filename="${encodeURIComponent(result.filename)}"`,
        },
      })
    }
    catch (e: any) {
      return c.json(fail(e.message), 404)
    }
  })

  // Conflict report
  app.get('/api/projects/:projectId/export/conflict-report', async (c) => {
    const projectId = c.req.param('projectId')
    try {
      const result = await exportConflictReport(projectId)
      return new Response(result.content, {
        headers: {
          'Content-Type': result.contentType,
          'Content-Disposition': `attachment; filename="${encodeURIComponent(result.filename)}"`,
        },
      })
    }
    catch (e: any) {
      return c.json(fail(e.message), 404)
    }
  })
}
