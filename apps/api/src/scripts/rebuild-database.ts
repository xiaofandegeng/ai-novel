import process from 'node:process'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { getDatabaseUrl } from '../config/environment'
import { assertDevelopmentDatabaseTarget } from './database-target'

async function rebuildDatabase() {
  const target = assertDevelopmentDatabaseTarget(getDatabaseUrl())
  console.log(`Rebuilding local development database: ${target.databaseName} on ${target.hostname}`)

  const client = postgres(target.url.toString(), { max: 1 })
  try {
    await client`drop schema if exists public cascade`
    await client`drop schema if exists drizzle cascade`
    await client`create schema public`
    await client`create extension if not exists vector`
    await migrate(drizzle(client), { migrationsFolder: './drizzle' })
  }
  finally {
    await client.end()
  }
  console.log(`Database ${target.databaseName} rebuilt and migrations applied`)
}

rebuildDatabase().catch((error) => {
  console.error('Database rebuild failed:', error)
  process.exitCode = 1
})
