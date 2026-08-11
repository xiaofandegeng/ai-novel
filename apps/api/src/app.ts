import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { getServerConfig } from './config/environment'
import { registerApiModules } from './modules'
import { fail } from './shared/http/responses'

interface CreateAppOptions {
  logging?: boolean
}

export function createApp(options: CreateAppOptions = {}) {
  const app = new Hono()
  const logging = options.logging ?? true
  const { corsOrigins } = getServerConfig()

  if (logging)
    app.use('*', logger())

  app.use('*', cors({
    origin: corsOrigins,
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    allowHeaders: ['Content-Type', 'Idempotency-Key', 'X-Correlation-ID'],
  }))

  registerApiModules(app)

  app.notFound(c => c.json(fail('Not Found'), 404))
  app.onError((error, c) => {
    if (logging)
      console.error('Server error:', error)
    return c.json(fail('Internal Server Error'), 500)
  })

  return app
}
