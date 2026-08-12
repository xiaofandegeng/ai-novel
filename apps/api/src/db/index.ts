import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { getDatabaseUrl } from '../config/database-environment'
import * as schema from './schema'

export const databaseUrl = getDatabaseUrl()

export const sql = postgres(databaseUrl, {
  max: 10,
})

export const db = drizzle(sql, { schema })
