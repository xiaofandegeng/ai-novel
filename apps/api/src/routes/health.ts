import type { Hono } from 'hono'
import { sql } from '../db'

export function registerHealthRoutes(app: Hono) {
  app.get('/api/health', async (c) => {
    try {
      await sql`select 1`
      return c.json({
        status: 'ok',
        message: 'AI Novel API is running',
        timestamp: new Date().toISOString(),
        services: {
          database: 'connected',
          databaseType: 'postgresql',
        },
      })
    }
    catch {
      return c.json({
        status: 'error',
        message: 'Database connection failed',
        timestamp: new Date().toISOString(),
        services: {
          database: 'disconnected',
          databaseType: 'postgresql',
        },
      }, 500)
    }
  })
}
