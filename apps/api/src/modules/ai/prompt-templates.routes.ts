import type { Hono } from 'hono'
import { success } from '../../shared/http/responses'
import {
  listProjectPromptOverrides,
  listPromptTemplates,
  PromptTemplateService,
  upsertProjectPromptOverride,
} from './prompt-template.service'

export function registerPromptTemplateRoutes(app: Hono) {
  app.get('/api/prompt-templates', async (c) => {
    return c.json(success(await listPromptTemplates()))
  })

  app.get('/api/projects/:projectId/prompt-overrides', async (c) => {
    return c.json(success(await listProjectPromptOverrides(c.req.param('projectId'))))
  })

  app.post('/api/projects/:projectId/prompt-overrides', async (c) => {
    const result = await upsertProjectPromptOverride(c.req.param('projectId'), await c.req.json())
    return c.json(success({ id: result.id }), result.created ? 201 : 200)
  })

  app.post('/api/projects/:projectId/prompt-templates/:key/test', async (c) => {
    const projectId = c.req.param('projectId')
    const key = c.req.param('key')
    const variables = await c.req.json<Record<string, unknown>>()
    const template = await PromptTemplateService.getTemplate(key, projectId)
    if (!template)
      return c.json({ error: 'Template not found' }, 404)

    return c.json(success({
      system: PromptTemplateService.render(template.system, variables),
      user: PromptTemplateService.render(template.user, variables),
    }))
  })
}
