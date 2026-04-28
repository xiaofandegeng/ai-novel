import type { SQLiteTableWithColumns } from 'drizzle-orm/sqlite-core'
import { eq } from 'drizzle-orm'
import { db } from '../db'

export function generateId(): string {
  return crypto.randomUUID()
}

export function now(): string {
  return new Date().toISOString()
}

export function success<T>(data: T, message?: string) {
  return { success: true as const, data, ...(message && { message }) }
}

export function fail(error: string) {
  return { success: false as const, error }
}

export async function findById<T extends SQLiteTableWithColumns<any>>(
  table: T,
  id: string,
) {
  const rows = await db.select().from(table).where(eq(table.id, id))
  return rows[0] ?? null
}

export function updatedFields(fields: Record<string, unknown>) {
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined)
      result[key] = value
  }
  result.updatedAt = now()
  return result
}
