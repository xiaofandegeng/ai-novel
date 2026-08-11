import type { Context, Hono } from 'hono'
import { DomainCommandError } from '../../eventing'
import { fail, success } from '../../shared/http/responses'
import { generateId } from '../../shared/utils'
import * as aiService from './ai.service'
import { CHANGE_PROJECT_AI_SETTINGS_COMMAND } from './project-settings.eventing'

export function registerSettingsRoutes(app: Hono) {
  app.get('/api/settings/ai/providers', async (c) => {
    return c.json(success(aiService.listAIProviderPresets()))
  })

  app.get('/api/projects/:projectId/settings/ai', async (c) => {
    try {
      const settings = await aiService.getAISettings(c.req.param('projectId'))
      return c.json(success(settings))
    }
    catch (error: unknown) {
      return settingsFailure(c, error)
    }
  })

  app.put('/api/projects/:projectId/settings/ai', async (c) => {
    try {
      const body = await c.req.json()
      const settings = await aiService.updateAISettings(
        c.req.param('projectId'),
        body,
        commandOptions(c),
      )
      return c.json(success(settings, 'AI settings saved'))
    }
    catch (error: unknown) {
      return settingsFailure(c, error)
    }
  })

  app.post('/api/projects/:projectId/settings/ai/test', async (c) => {
    const body = await c.req.json().catch(() => ({}))

    try {
      const result = await aiService.testAIConnection(c.req.param('projectId'), body)
      return c.json(success(result))
    }
    catch (error) {
      const message = error instanceof Error ? error.message : 'AI 服务连接失败'
      return c.json(success({
        ok: false,
        message,
      }))
    }
  })

  app.post('/api/projects/:projectId/settings/ai/test-embedding', async (c) => {
    const body = await c.req.json().catch(() => ({}))

    try {
      const result = await aiService.testEmbeddingConnection(c.req.param('projectId'), body)
      return c.json(success(result))
    }
    catch (error) {
      const message = error instanceof Error ? error.message : 'Embedding 服务连接失败'
      return c.json(success({
        ok: false,
        message,
      }))
    }
  })
}

function commandOptions(c: Context) {
  const idempotencyKey = c.req.header('Idempotency-Key')?.trim()
  const commandId = idempotencyKey
    ? `${CHANGE_PROJECT_AI_SETTINGS_COMMAND}:${c.req.param('projectId')}:${idempotencyKey}`
    : generateId()
  return {
    commandId,
    correlationId: c.req.header('X-Correlation-ID')?.trim() || commandId,
  }
}

function settingsFailure(c: Context, error: unknown): Response {
  if (!(error instanceof DomainCommandError))
    throw error
  if (error.code === 'PROJECT_NOT_FOUND')
    return c.json(fail('Project not found'), 404)
  return c.json(fail(error.message), 400)
}
