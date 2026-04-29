import type { Hono } from 'hono'
import { asc, eq } from 'drizzle-orm'
import { db } from '../db'
import { chapters, novelProjects, volumes } from '../db/schema'
import { fail, success } from '../utils'

export function registerExportRoutes(app: Hono) {
  app.get('/api/projects/:projectId/export', async (c) => {
    const projectId = c.req.param('projectId')

    // 1. Get Project
    const [project] = await db.select().from(novelProjects).where(eq(novelProjects.id, projectId))
    if (!project)
      return c.json(fail('Project not found'), 404)

    // 2. Get Volumes and Chapters
    const vols = await db.select().from(volumes).where(eq(volumes.projectId, projectId)).orderBy(asc(volumes.orderIndex))
    const chs = await db.select().from(chapters).where(eq(chapters.projectId, projectId)).orderBy(asc(chapters.chapterNumber))

    // 3. Aggregate into Markdown
    let md = `# ${project.title}\n\n`
    if (project.description)
      md += `${project.description}\n\n---\n\n`

    for (const vol of vols) {
      md += `\n## ${vol.title}\n\n`
      const volChapters = chs.filter(ch => ch.volumeId === vol.id)
      for (const ch of volChapters) {
        md += `### ${ch.title}\n\n`
        md += `${ch.draft || '_[Empty Chapter]_'}\n\n`
      }
    }

    return c.json(success({
      filename: `${project.title}.md`,
      content: md,
    }))
  })
}
