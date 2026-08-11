import { defineConfig } from 'drizzle-kit'
import { getDatabaseUrl } from './src/config/environment'

export default defineConfig({
  schema: './src/db/schema',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: getDatabaseUrl(),
  },
})
