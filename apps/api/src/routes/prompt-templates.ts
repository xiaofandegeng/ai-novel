import type { Hono } from 'hono'
import { and, eq } from 'drizzle-orm'
import { db } from '../db'
import { projectPromptOverrides, promptTemplates } from '../db/schema'
import { PromptTemplateService } from '../services/prompt-template.service'
import { generateId, now, success } from '../utils'

export function registerPromptTemplateRoutes(app: Hono) {
  // 列出所有可用模板
  app.get('/api/prompt-templates', async (c) => {
    const rows = await db.select().from(promptTemplates).where(eq(promptTemplates.status, 'active'))
    return c.json(success(rows))
  })

  // 获取项目的覆盖设置
  app.get('/api/projects/:projectId/prompt-overrides', async (c) => {
    const projectId = c.req.param('projectId')
    const rows = await db.select().from(projectPromptOverrides).where(eq(projectPromptOverrides.projectId, projectId))
    return c.json(success(rows))
  })

  // 保存项目的覆盖设置
  app.post('/api/projects/:projectId/prompt-overrides', async (c) => {
    const projectId = c.req.param('projectId')
    const body = await c.req.json()
    const { templateKey, overrideSystemPrompt, overrideUserPromptTemplate, enabled } = body

    const [existing] = await db
      .select()
      .from(projectPromptOverrides)
      .where(and(eq(projectPromptOverrides.projectId, projectId), eq(projectPromptOverrides.templateKey, templateKey)))
      .limit(1)

    if (existing) {
      await db.update(projectPromptOverrides).set({
        overrideSystemPrompt,
        overrideUserPromptTemplate,
        enabled: enabled !== undefined ? (enabled ? 1 : 0) : existing.enabled,
        updatedAt: now(),
      }).where(eq(projectPromptOverrides.id, existing.id))
      return c.json(success({ id: existing.id }))
    }
    else {
      const id = generateId()
      await db.insert(projectPromptOverrides).values({
        id,
        projectId,
        templateKey,
        overrideSystemPrompt,
        overrideUserPromptTemplate,
        enabled: enabled ? 1 : 0,
        createdAt: now(),
        updatedAt: now(),
      })
      return c.json(success({ id }), 201)
    }
  })

  // 测试提示词渲染
  app.post('/api/projects/:projectId/prompt-templates/:key/test', async (c) => {
    const projectId = c.req.param('projectId')
    const key = c.req.param('key')
    const variables = await c.req.json()

    const template = await PromptTemplateService.getTemplate(key, projectId)
    if (!template)
      return c.json({ error: 'Template not found' }, 404)

    const renderedSystem = PromptTemplateService.render(template.system, variables)
    const renderedUser = PromptTemplateService.render(template.user, variables)

    return c.json(success({
      system: renderedSystem,
      user: renderedUser,
    }))
  })
}
