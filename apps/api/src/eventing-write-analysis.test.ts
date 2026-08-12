import { describe, expect, it } from 'vitest'
import { analyzeEventingWrites } from '../test/architecture/domain-event-insert-analysis'

const semanticRoots = {
  'db/schema/eventing.ts': `
    export const domainEvents = { tableName: 'domain_events' }
  `,
  'db/schema/index.ts': `
    export { domainEvents } from './eventing'
  `,
  'eventing/event-store.ts': `
    export interface EventStoreSession {
      appendBatch: (batch: unknown) => Promise<unknown>
    }
  `,
}

function analyzeProbe(source: string, supportingFiles: Record<string, string> = {}) {
  return analyzeEventingWrites({
    files: {
      ...semanticRoots,
      ...supportingFiles,
      'probe.ts': source,
    },
    inspectFiles: ['probe.ts'],
  })
}

describe('eventing write architecture analysis', () => {
  it.each([
    `
      import { domainEvents as eventTable } from './db/schema'
      declare const tx: { insert: (table: unknown) => unknown }
      tx.insert(eventTable)
    `,
    `
      import * as schema from './db/schema'
      declare const tx: { insert: (table: unknown) => unknown }
      tx.insert(schema.domainEvents)
    `,
  ])('preserves direct import and namespace-member insert coverage', (source) => {
    expect(analyzeProbe(source).domainEventInserts).toMatchObject([
      { file: 'probe.ts', kind: 'drizzle-insert' },
    ])
  })

  it('follows local aliases of the domain event table into Drizzle inserts', () => {
    const analysis = analyzeProbe(`
      import { domainEvents } from './db/schema'
      declare const tx: { insert: (table: unknown) => unknown }
      const eventTable = domainEvents
      tx.insert(eventTable)
    `)

    expect(analysis.domainEventInserts).toMatchObject([
      { file: 'probe.ts', kind: 'drizzle-insert' },
    ])
  })

  it('follows namespace destructuring aliases of the domain event table', () => {
    const analysis = analyzeProbe(`
      import * as schema from './db/schema'
      declare const tx: { insert: (table: unknown) => unknown }
      const { domainEvents: eventTable } = schema
      tx.insert(eventTable)
    `)

    expect(analysis.domainEventInserts).toMatchObject([
      { file: 'probe.ts', kind: 'drizzle-insert' },
    ])
  })

  it('follows an aliased domain event table through a barrel re-export', () => {
    const analysis = analyzeProbe(`
      import { eventRows as eventTable } from './test-barrel'
      declare const tx: { insert: (table: unknown) => unknown }
      tx.insert(eventTable)
    `, {
      'test-barrel.ts': `
        export { domainEvents as eventRows } from './db/schema/eventing'
      `,
    })

    expect(analysis.domainEventInserts).toMatchObject([
      { file: 'probe.ts', kind: 'drizzle-insert' },
    ])
  })

  it.each([
    `sql.unsafe('insert into domain_events (event_id) values (1)')`,
    `sql.unsafe('insert into "public"."domain_events" ("event_id") values (1)')`,
    'sql`insert into public."domain_events" ("event_id") values (1)`',
  ])('detects raw SQL domain event inserts: %s', (statement) => {
    const analysis = analyzeProbe(`
      declare const sql: {
        unsafe: (statement: string) => unknown
        (strings: TemplateStringsArray, ...values: unknown[]): unknown
      }
      ${statement}
    `)

    expect(analysis.domainEventInserts).toMatchObject([
      { file: 'probe.ts', kind: 'sql-literal-insert' },
    ])
  })

  it('follows the domain event table through SQL template interpolation', () => {
    const analysis = analyzeProbe(`
      import { domainEvents as eventTable } from './db/schema'
      declare const sql: (strings: TemplateStringsArray, ...values: unknown[]) => unknown
      declare const event: unknown
      sql\`insert into \${eventTable} values (\${event})\`
    `)

    expect(analysis.domainEventInserts).toMatchObject([
      { file: 'probe.ts', kind: 'sql-template-insert' },
    ])
  })

  it.each([
    `session['appendBatch']({})`,
    `const { appendBatch } = session; appendBatch({})`,
    `const append = session.appendBatch.bind(session); append({})`,
  ])('follows the EventStore append capability into calls: %s', (statement) => {
    const analysis = analyzeProbe(`
      import type { EventStoreSession } from './eventing/event-store'
      declare const session: EventStoreSession
      ${statement}
    `)

    expect(analysis.appendBatchCalls).toMatchObject([
      { file: 'probe.ts' },
    ])
  })
})
