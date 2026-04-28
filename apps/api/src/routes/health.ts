import type { Hono } from 'hono'
import { sqlite } from '../db'

export function registerHealthRoutes(app: Hono) {
  app.get('/api/health', (c) => {
    let dbStatus: 'connected' | 'error' = 'error'

    try {
      sqlite.prepare('SELECT 1').get()
      dbStatus = 'connected'
    }
    catch {
      dbStatus = 'error'
    }

    return c.json({
      status: 'ok' as const,
      message: 'AI Novel API is running',
      timestamp: new Date().toISOString(),
      services: {
        database: dbStatus,
      },
    })
  })
}
