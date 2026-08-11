import { userInfo } from 'node:os'
import process from 'node:process'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'

function resolveTestDatabaseUrl() {
  return process.env.TEST_DATABASE_URL
    ?? `postgres://${userInfo().username}@localhost:5432/ai_novel_test`
}

export default async function setupTestDatabase() {
  const databaseUrl = new URL(resolveTestDatabaseUrl())
  const databaseName = databaseUrl.pathname.slice(1)

  if (!/^\w+_test$/i.test(databaseName))
    throw new Error(`Refusing to prepare non-test database: ${databaseName}`)

  const adminUrl = new URL(databaseUrl)
  adminUrl.pathname = '/postgres'
  const admin = postgres(adminUrl.toString(), { max: 1 })
  const existing = await admin<{ exists: boolean }[]>`
    select exists(select 1 from pg_database where datname = ${databaseName}) as exists
  `
  if (!existing[0]?.exists)
    await admin.unsafe(`create database "${databaseName}"`)
  await admin.end()

  const client = postgres(databaseUrl.toString(), { max: 1 })
  await client`create extension if not exists vector`
  await migrate(drizzle(client), {
    migrationsFolder: new URL('../drizzle', import.meta.url).pathname,
  })
  await client.end()
}
