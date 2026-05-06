import { existsSync } from 'node:fs'
import { userInfo } from 'node:os'
import { resolve } from 'node:path'
import process from 'node:process'
import { config } from 'dotenv'
import { defineConfig } from 'drizzle-kit'

for (const envPath of [resolve(process.cwd(), '.env'), resolve(process.cwd(), '../../.env')]) {
  if (existsSync(envPath))
    config({ path: envPath, override: false })
}

export default defineConfig({
  schema: './src/db/schema',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL || `postgres://${userInfo().username}@localhost:5432/ai_novel`,
  },
})
