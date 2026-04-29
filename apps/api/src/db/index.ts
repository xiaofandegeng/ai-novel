import { existsSync } from 'node:fs'
import { userInfo } from 'node:os'
import { resolve } from 'node:path'
import process from 'node:process'
import { config } from 'dotenv'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

for (const envPath of [resolve(process.cwd(), '.env'), resolve(process.cwd(), '../../.env')]) {
  if (existsSync(envPath))
    config({ path: envPath, override: false })
}

export const databaseUrl
  = process.env.DATABASE_URL || `postgres://${userInfo().username}@localhost:5432/ai_novel`

export const sql = postgres(databaseUrl, {
  max: 10,
})

export const db = drizzle(sql, { schema })
