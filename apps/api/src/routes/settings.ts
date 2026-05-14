import type { Hono } from 'hono'
import * as aiService from '../services/ai.service'
import { success } from '../utils'

export function registerSettingsRoutes(app: Hono) {
  app.get('/api/settings/ai', async (c) => {
    const settings = await aiService.getAISettings()
    return c.json(success(settings))
  })

  app.get('/api/settings/ai/providers', async (c) => {
    return c.json(success(aiService.listAIProviderPresets()))
  })

  app.put('/api/settings/ai', async (c) => {
    const body = await c.req.json()
    const settings = await aiService.updateAISettings(body)
    return c.json(success(settings, 'AI settings saved'))
  })

  app.post('/api/settings/ai/test', async (c) => {
    const body = await c.req.json().catch(() => ({}))

    try {
      const result = await aiService.testAIConnection(body)
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

  app.post('/api/settings/ai/test-embedding', async (c) => {
    const body = await c.req.json().catch(() => ({}))

    try {
      const result = await aiService.testEmbeddingConnection(body)
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
