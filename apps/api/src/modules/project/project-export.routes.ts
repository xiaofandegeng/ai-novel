import type { Context, Hono } from 'hono'
import { fail, success } from '../../shared/http/responses'
import {
  getProjectExportData,
  renderCharacterProfiles,
  renderConflictReport,
  renderForeshadowingReport,
  renderManuscript,
  renderProposal,
} from './project-export.service'

function textResponse(c: Context, content: string, filename: string, contentType = 'text/markdown; charset=utf-8') {
  return c.body(content, 200, {
    'Content-Type': contentType,
    'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
  })
}

async function exportText(
  c: Context,
  render: () => Promise<string>,
  filename: string,
  contentType?: string,
) {
  try {
    return textResponse(c, await render(), filename, contentType)
  }
  catch (error) {
    return c.json(fail(error instanceof Error ? error.message : 'Export failed'), 404)
  }
}

export function registerProjectExportRoutes(app: Hono) {
  app.get('/api/projects/:projectId/export', async (c) => {
    try {
      return c.json(success(await getProjectExportData(c.req.param('projectId'))))
    }
    catch (error) {
      return c.json(fail(error instanceof Error ? error.message : 'Export failed'), 404)
    }
  })

  app.get('/api/projects/:projectId/export/manuscript', (c) => {
    const format = c.req.query('format') === 'txt' ? 'txt' : 'md'
    return exportText(
      c,
      () => renderManuscript(c.req.param('projectId'), {
        format,
        includeOutline: c.req.query('includeOutline') === 'true',
        includeScenes: c.req.query('includeScenes') === 'true',
        includeUnfinishedChapters: c.req.query('includeUnfinishedChapters') === 'true',
        includeAuthorNotes: c.req.query('includeAuthorNotes') === 'true',
      }),
      `manuscript.${format}`,
      format === 'txt' ? 'text/plain; charset=utf-8' : undefined,
    )
  })

  app.get('/api/projects/:projectId/export/proposal', c => exportText(c, () => renderProposal(c.req.param('projectId')), 'proposal.md'))
  app.get('/api/projects/:projectId/export/characters', c => exportText(c, () => renderCharacterProfiles(c.req.param('projectId')), 'characters.md'))
  app.get('/api/projects/:projectId/export/foreshadowing-report', c => exportText(c, () => renderForeshadowingReport(c.req.param('projectId')), 'foreshadowing-report.md'))
  app.get('/api/projects/:projectId/export/conflict-report', c => exportText(c, () => renderConflictReport(c.req.param('projectId')), 'conflict-report.md'))
}
