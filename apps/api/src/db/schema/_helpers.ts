import { timestamp } from 'drizzle-orm/pg-core'

export const timestamps = {
  createdAt: timestamp('created_at', { mode: 'string' }).notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: timestamp('updated_at', { mode: 'string' }).notNull().$defaultFn(() => new Date().toISOString()),
}
