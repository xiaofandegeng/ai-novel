import { serve } from '@hono/node-server'
import { createApp } from './app'
import { getServerConfig } from './config/environment'

const app = createApp()
const { port } = getServerConfig()

serve({ fetch: app.fetch, port }, (info) => {
  // eslint-disable-next-line no-console
  console.log(`AI Novel API running on http://localhost:${info.port}`)
})
