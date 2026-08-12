import type { Context, Hono } from 'hono'
import { DomainCommandError } from '../../eventing'
import { fail, success } from '../../shared/http/responses'
import { generateId } from '../../shared/utils'
import { SET_PROJECT_PROMPT_OVERRIDE_COMMAND } from './prompt-settings.eventing'
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
    const projectId = c.req.param('projectId')
    const input = await c.req.json()
    try {
      const result = await upsertProjectPromptOverride(
        projectId,
        input,
        commandOptions(c, projectId, input.templateKey),
      )
      return c.json(success({ id: result.id }), result.created ? 201 : 200)
    }
    catch (error: unknown) {
      return promptCommandFailure(c, error)
    }
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

function commandOptions(c: Context, projectId: string, templateKey: unknown) {
  const idempotencyKey = c.req.header('Idempotency-Key')?.trim()
  const commandId = idempotencyKey
    ? `${SET_PROJECT_PROMPT_OVERRIDE_COMMAND}:${projectId}:${String(templateKey)}:${idempotencyKey}`
    : generateId()
  return {
    commandId,
    correlationId: c.req.header('X-Correlation-ID')?.trim() || commandId,
  }
}

function promptCommandFailure(c: Context, error: unknown): Response {
  if (!(error instanceof DomainCommandError))
    throw error
  if (error.code === 'PROJECT_NOT_FOUND')
    return c.json(fail('Project not found'), 404)
  return c.json(fail(error.message), 400)
}
