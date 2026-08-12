import type { EventingTransaction } from './event-store'
import { sql } from 'drizzle-orm'

// Stable two-int namespace: ASCII "AINW" / "EVST". Appends take the shared
// transaction lock before project locks; replay takes the exclusive lock before
// its horizon so sequence allocation gaps cannot cross the replay boundary.
export const EVENT_STORE_ADVISORY_LOCK = {
  namespace: 0x4149_4E57,
  key: 0x4556_5354,
} as const

export async function acquireEventStoreAppendLock(
  transaction: EventingTransaction,
): Promise<void> {
  await transaction.execute(sql`
    select pg_advisory_xact_lock_shared(
      ${EVENT_STORE_ADVISORY_LOCK.namespace},
      ${EVENT_STORE_ADVISORY_LOCK.key}
    )
  `)
}

export async function acquireEventStoreReplayLock(
  transaction: EventingTransaction,
): Promise<void> {
  await transaction.execute(sql`
    select pg_advisory_xact_lock(
      ${EVENT_STORE_ADVISORY_LOCK.namespace},
      ${EVENT_STORE_ADVISORY_LOCK.key}
    )
  `)
}
