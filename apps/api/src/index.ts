import process from 'node:process'
import { serve } from '@hono/node-server'
import { createApp } from './app'

const app = createApp()

const port = Number(process.env.PORT) || 3000

serve({ fetch: app.fetch, port }, (info) => {
  // eslint-disable-next-line no-console
  console.log(`AI Novel API running on http://localhost:${info.port}`)
})
