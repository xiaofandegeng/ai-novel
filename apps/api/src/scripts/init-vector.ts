import { existsSync } from 'node:fs'
import { userInfo } from 'node:os'
import { resolve } from 'node:path'
import process from 'node:process'
import { config } from 'dotenv'
import postgres from 'postgres'

for (const envPath of [resolve(process.cwd(), '.env'), resolve(process.cwd(), '../../.env')]) {
  if (existsSync(envPath))
    config({ path: envPath, override: false })
}

const url = process.env.DATABASE_URL || `postgres://${userInfo().username}@localhost:5432/ai_novel`

async function main() {
  const sql = postgres(url)
  console.log('Enabling pgvector extension...')
  try {
    await sql`CREATE EXTENSION IF NOT EXISTS vector;`
    console.log('pgvector extension enabled.')
  }
  catch (err) {
    console.error('Failed to enable pgvector:', err)
  }
  finally {
    await sql.end()
  }
}

main()
