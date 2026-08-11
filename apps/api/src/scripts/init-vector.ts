import process from 'node:process'
import postgres from 'postgres'
import { getDatabaseUrl } from '../config/environment'

const url = getDatabaseUrl()

async function main() {
  const sql = postgres(url)
  console.log('Enabling pgvector extension...')
  try {
    await sql`CREATE EXTENSION IF NOT EXISTS vector;`
    console.log('pgvector extension enabled.')
  }
  finally {
    await sql.end()
  }
}

main().catch((error) => {
  console.error('Failed to enable pgvector:', error)
  process.exitCode = 1
})
