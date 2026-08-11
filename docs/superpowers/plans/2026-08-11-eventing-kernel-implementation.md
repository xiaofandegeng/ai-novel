# Eventing Kernel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the PostgreSQL eventing kernel required by the full-product event-sourcing rebuild, without changing current product behavior.

**Architecture:** Add an append-only multi-stream Event Store, event registry and upcasters, transactional Command Bus, synchronous and asynchronous projection runners, durable Outbox, aggregate snapshots, and deterministic replay. The kernel lives under `apps/api/src/eventing` and may depend on `db`, `config`, and shared primitives, but it must not import any novel domain module.

**Tech Stack:** TypeScript, Hono repository conventions, Drizzle ORM, PostgreSQL, postgres.js, Vitest, pnpm.

## Global Constraints

- Canonical design: `docs/superpowers/specs/2026-08-11-full-product-event-sourcing-design.md`.
- Preserve all current HTTP paths and product behavior during this phase.
- Do not clear the development database in this phase; only add eventing infrastructure tables.
- Route modules remain protocol-only and no route changes are required.
- Eventing infrastructure must not import `apps/api/src/modules`.
- `domain_events` is append-only; migration must reject `UPDATE` and `DELETE`.
- Command retries are idempotent by `commandId`.
- Multi-stream appends are atomic and use expected aggregate versions.
- Project content and credentials are not introduced in this phase, so encryption work belongs to the Project migration plan.
- Tests may only use a database ending in `_test`.
- Every task follows red → green → refactor and ends with a focused commit.

---

## File Map

| File | Responsibility |
| --- | --- |
| `apps/api/src/eventing/event-types.ts` | Event, stream, command, snapshot, outbox and projection contracts |
| `apps/api/src/eventing/errors.ts` | Typed eventing and command errors |
| `apps/api/src/eventing/event-registry.ts` | Event definitions, payload validation hooks and upcaster chains |
| `apps/api/src/eventing/event-store.ts` | Transaction sessions, stream loading, atomic append and snapshots |
| `apps/api/src/eventing/projection-runner.ts` | Synchronous projectors, asynchronous checkpoints and batch processing |
| `apps/api/src/eventing/outbox-worker.ts` | Durable outbox enqueue, lease, dispatch, retry and completion |
| `apps/api/src/eventing/command-bus.ts` | Handler registry, receipts, event append, sync projection and outbox transaction |
| `apps/api/src/eventing/aggregate-repository.ts` | Snapshot plus event loading and pure reducer execution |
| `apps/api/src/eventing/replay.ts` | Projection reset and deterministic full or bounded replay |
| `apps/api/src/eventing/index.ts` | Public eventing exports |
| `apps/api/src/db/schema/eventing.ts` | Event Store, snapshot, receipt, checkpoint and outbox schema |
| `apps/api/src/db/schema/index.ts` | Schema barrel export |
| `apps/api/src/architecture.test.ts` | Eventing dependency and direct-write architecture constraints |
| `apps/api/vitest.config.ts` | Eventing coverage inclusion and phase threshold |

---

### Task 1: Event contracts, typed errors, and event registry

**Files:**
- Create: `apps/api/src/eventing/event-types.ts`
- Create: `apps/api/src/eventing/errors.ts`
- Create: `apps/api/src/eventing/event-registry.ts`
- Create: `apps/api/src/eventing/event-registry.test.ts`
- Create: `apps/api/src/eventing/index.ts`

**Interfaces:**
- Produces: `StreamRef`, `PendingEvent`, `StoredEvent`, `StreamAppend`, `AppendBatch`, `CommandEnvelope`, `CommandDecision`, `OutboxIntent`, `AggregateSnapshot`.
- Produces: `EventConcurrencyError`, `DuplicateEventError`, `UnknownEventTypeError`, `InvalidEventPayloadError`, `UnknownCommandTypeError`, `DomainCommandError`.
- Produces: `EventRegistry.register()`, `EventRegistry.decode()` and `EventRegistry.has()`.

- [x] **Step 1: Write the failing registry tests**

```ts
import { describe, expect, it } from 'vitest'
import { EventRegistry } from './event-registry'
import { UnknownEventTypeError } from './errors'

describe('EventRegistry', () => {
  it('decodes a registered current-version event', () => {
    const registry = new EventRegistry()
    registry.register({
      eventType: 'KernelTestCreated',
      currentSchemaVersion: 1,
      validate: payload => payload as { value: string },
      upcasters: {},
    })
    expect(registry.decode('KernelTestCreated', 1, { value: 'ok' })).toEqual({ value: 'ok' })
  })

  it('applies every upcaster until the current version', () => {
    const registry = new EventRegistry()
    registry.register({
      eventType: 'KernelTestRenamed',
      currentSchemaVersion: 3,
      validate: payload => payload as { title: string },
      upcasters: {
        1: payload => ({ name: (payload as { value: string }).value }),
        2: payload => ({ title: (payload as { name: string }).name }),
      },
    })
    expect(registry.decode('KernelTestRenamed', 1, { value: '新标题' })).toEqual({ title: '新标题' })
  })

  it('rejects unknown event types', () => {
    expect(() => new EventRegistry().decode('Missing', 1, {})).toThrow(UnknownEventTypeError)
  })
})
```

- [x] **Step 2: Run the test and observe the missing-module failure**

Run: `pnpm --filter @ai-novel/api test -- src/eventing/event-registry.test.ts`  
Expected: FAIL because `event-registry.ts` and `errors.ts` do not exist.

- [x] **Step 3: Implement exact eventing contracts**

```ts
export type JsonObject = Record<string, unknown>

export interface StreamRef {
  aggregateType: string
  aggregateId: string
  projectId?: string
}

export interface PendingEvent<TPayload extends JsonObject = JsonObject> {
  eventId: string
  eventType: string
  schemaVersion: number
  payload: TPayload
  metadata: JsonObject
  occurredAt: string
}

export interface StoredEvent<TPayload extends JsonObject = JsonObject> extends PendingEvent<TPayload>, StreamRef {
  globalPosition: number
  aggregateVersion: number
  commandId: string
  eventIndex: number
  correlationId: string
  causationId?: string
}

export interface StreamAppend {
  stream: StreamRef
  expectedVersion: number
  events: PendingEvent[]
}

export interface AppendBatch {
  commandId: string
  correlationId: string
  causationId?: string
  streams: StreamAppend[]
}

export interface CommandEnvelope<TPayload extends JsonObject = JsonObject> {
  commandId: string
  commandType: string
  aggregateType: string
  aggregateId: string
  projectId?: string
  correlationId: string
  causationId?: string
  payload: TPayload
}

export interface OutboxIntent {
  id: string
  eventId: string
  handlerName: string
  payload: JsonObject
  availableAt?: string
}

export interface CommandDecision<TResult> {
  streams: StreamAppend[]
  result: TResult
  outbox?: OutboxIntent[]
}

export interface AggregateSnapshot<TState extends JsonObject = JsonObject> extends StreamRef {
  aggregateVersion: number
  schemaVersion: number
  state: TState
  createdAt: string
}
```

Keep unvalidated event payloads `unknown` until a registry validator narrows them; do not introduce `any`.

- [x] **Step 4: Implement typed errors and the registry**

```ts
export interface EventDefinition<TPayload extends JsonObject> {
  eventType: string
  currentSchemaVersion: number
  validate: (payload: unknown) => TPayload
  upcasters: Record<number, (payload: unknown) => unknown>
}

export class EventRegistry {
  private readonly definitions = new Map<string, EventDefinition<JsonObject>>()

  register<TPayload extends JsonObject>(definition: EventDefinition<TPayload>): void
  has(eventType: string): boolean
  decode(eventType: string, schemaVersion: number, payload: unknown): JsonObject
}
```

`register` rejects duplicate event types. `decode` rejects future versions, requires every intermediate upcaster, and validates the final payload.

- [x] **Step 5: Run the focused tests and typecheck**

Run: `pnpm --filter @ai-novel/api test -- src/eventing/event-registry.test.ts`  
Expected: 3 tests PASS.

Run: `pnpm --filter @ai-novel/api typecheck`  
Expected: PASS.

- [x] **Step 6: Commit the contracts**

```bash
git add apps/api/src/eventing
git commit -m "feat(api): add eventing contracts and registry"
```

---

### Task 2: Eventing schema, migration, and atomic Event Store

**Files:**
- Create: `apps/api/src/db/schema/eventing.ts`
- Modify: `apps/api/src/db/schema/index.ts`
- Create: `apps/api/src/eventing/event-store.ts`
- Create: `apps/api/src/eventing/event-store.integration.test.ts`
- Create: generated `apps/api/drizzle/0026_*.sql`
- Modify: generated migration to add append-only trigger functions

**Interfaces:**
- Consumes: `AppendBatch`, `StoredEvent`, `StreamRef`, `AggregateSnapshot`.
- Produces: `EventingTransaction`, `EventStore.withTransaction<T>()` and `EventStoreSession` methods `loadStream`, `appendBatch`, `readAll`, `getSnapshot`, `putSnapshot`.

- [ ] **Step 1: Write failing Event Store integration tests**

```ts
describe('EventStore', () => {
  beforeEach(resetTestDatabase)

  it('appends and loads one stream in version order', async () => {
    const stored = await store.withTransaction(session => session.appendBatch(batch({
      expectedVersion: 0,
      events: [pending('Created'), pending('Renamed')],
    })))
    expect(stored.map(event => event.aggregateVersion)).toEqual([1, 2])
    await expect(store.loadStream(stream)).resolves.toMatchObject([
      { eventType: 'Created', aggregateVersion: 1 },
      { eventType: 'Renamed', aggregateVersion: 2 },
    ])
  })

  it('rejects a stale expected version without partial writes', async () => {
    await appendInitialEvent()
    await expect(store.withTransaction(session => session.appendBatch(batch({
      expectedVersion: 0,
      events: [pending('StaleWrite')],
    })))).rejects.toBeInstanceOf(EventConcurrencyError)
    await expect(store.loadStream(stream)).resolves.toHaveLength(1)
  })

  it('atomically appends multiple streams', async () => {
    await expect(store.withTransaction(session => session.appendBatch(multiStreamBatch()))).resolves.toHaveLength(3)
    await expect(store.loadStream(firstStream)).resolves.toHaveLength(1)
    await expect(store.loadStream(secondStream)).resolves.toHaveLength(2)
  })

  it('rolls back every stream when one expected version is stale', async () => {
    await appendInitialEvent()
    await expect(store.withTransaction(session => session.appendBatch(conflictingMultiStreamBatch()))).rejects.toBeInstanceOf(EventConcurrencyError)
    await expect(store.loadStream(unrelatedStream)).resolves.toHaveLength(0)
  })
})
```

Also test duplicate `eventId`, monotonic `globalPosition`, stream filtering, snapshot replacement, and database rejection of direct `UPDATE`/`DELETE` on `domain_events`.

- [ ] **Step 2: Run the focused integration test and observe failure**

Run: `pnpm --filter @ai-novel/api test -- src/eventing/event-store.integration.test.ts`  
Expected: FAIL because the eventing schema and Event Store are missing.

- [ ] **Step 3: Define the Drizzle schema**

Implement these exported tables with the exact names from the design:

```ts
export const aggregateStreams = pgTable('aggregate_streams', { /* composite stream head */ })
export const domainEvents = pgTable('domain_events', { /* BIGSERIAL global position and envelope */ })
export const aggregateSnapshots = pgTable('aggregate_snapshots', { /* latest snapshot per stream */ })
export const commandReceipts = pgTable('command_receipts', { /* idempotent result */ })
export const projectionCheckpoints = pgTable('projection_checkpoints', { /* consumer position */ })
export const eventOutbox = pgTable('event_outbox', { /* lease and retry fields */ })
```

Use composite primary or unique indexes exactly as specified in the design document. Use `jsonb` for payload, metadata, snapshots and command results. Use timestamp string mode consistently with the existing schema.

- [ ] **Step 4: Generate and harden the migration**

Run: `pnpm db:generate`  
Expected: a new migration containing only eventing tables and indexes.

Append SQL defining a trigger function that raises an exception for `UPDATE` or `DELETE` on `domain_events`, then attach it as a `BEFORE UPDATE OR DELETE` trigger.

- [ ] **Step 5: Implement the Event Store transaction session**

```ts
export class EventStore {
  async withTransaction<T>(work: (session: EventStoreSession) => Promise<T>): Promise<T>
  async loadStream(stream: StreamRef, fromVersion?: number): Promise<StoredEvent[]>
  async readAll(afterPosition: number, limit: number): Promise<StoredEvent[]>
}

export type EventingTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0]

export interface EventStoreSession {
  transaction: EventingTransaction
  loadStream(stream: StreamRef, fromVersion?: number): Promise<StoredEvent[]>
  appendBatch(batch: AppendBatch): Promise<StoredEvent[]>
  getSnapshot(stream: StreamRef): Promise<AggregateSnapshot | null>
  putSnapshot(snapshot: AggregateSnapshot): Promise<void>
}
```

For `appendBatch`, sort streams by `aggregateType/aggregateId`, lock or conditionally update each stream head, validate every expected version, then insert all events. Convert unique stream-version and event-ID violations to typed errors without exposing raw SQL details.

- [ ] **Step 6: Run migration and focused tests**

Run: `pnpm db:migrate`  
Expected: migration succeeds on the configured development database without deleting existing tables.

Run: `pnpm --filter @ai-novel/api test -- src/eventing/event-store.integration.test.ts`  
Expected: all Event Store tests PASS.

- [ ] **Step 7: Commit Event Store infrastructure**

```bash
git add apps/api/src/db/schema apps/api/src/eventing/event-store.ts apps/api/src/eventing/event-store.integration.test.ts apps/api/drizzle
git commit -m "feat(api): add append-only event store"
```

---

### Task 3: Projection registry and ordered runners

**Files:**
- Create: `apps/api/src/eventing/projection-runner.ts`
- Create: `apps/api/src/eventing/projection-runner.integration.test.ts`
- Modify: `apps/api/src/eventing/event-types.ts`
- Modify: `apps/api/src/eventing/index.ts`

**Interfaces:**
- Consumes: `StoredEvent`, Event Store `readAll`, `projectionCheckpoints`.
- Produces: `ProjectionRegistry.register()`, `ProjectionRegistry.projectSync()`, `ProjectionRunner.runBatch()` and `ProjectionRunner.reset()`.

- [ ] **Step 1: Write failing projection tests**

```ts
it('runs matching synchronous projectors in event order', async () => {
  const seen: number[] = []
  registry.register({
    name: 'kernel-sync',
    mode: 'sync',
    handles: ['Created'],
    project: async (_tx, event) => { seen.push(event.globalPosition) },
  })
  await registry.projectSync(transaction, storedEvents)
  expect(seen).toEqual([...seen].sort((a, b) => a - b))
})

it('resumes an async projection after its checkpoint', async () => {
  await runner.runBatch('kernel-async', 2)
  await runner.runBatch('kernel-async', 2)
  expect(seenEventIds).toEqual(expectedEventIds)
  await expect(readCheckpoint('kernel-async')).resolves.toBe(lastGlobalPosition)
})
```

Also test duplicate projection names, a handler failure leaving the checkpoint unchanged, and reset returning a checkpoint to zero.

- [ ] **Step 2: Run the tests and observe missing runner failure**

Run: `pnpm --filter @ai-novel/api test -- src/eventing/projection-runner.integration.test.ts`  
Expected: FAIL because projection infrastructure is missing.

- [ ] **Step 3: Implement projection definitions and registry**

```ts
export interface ProjectionDefinition {
  name: string
  mode: 'sync' | 'async'
  handles: readonly string[]
  project: (transaction: EventingTransaction, event: StoredEvent) => Promise<void>
  reset?: (transaction: EventingTransaction) => Promise<void>
}
```

`projectSync` sorts events by global position and calls only matching `sync` definitions. `runBatch` reads after the stored checkpoint and advances it only in the same successful projection transaction.

- [ ] **Step 4: Run focused tests and typecheck**

Run: `pnpm --filter @ai-novel/api test -- src/eventing/projection-runner.integration.test.ts`  
Expected: PASS.

Run: `pnpm --filter @ai-novel/api typecheck`  
Expected: PASS.

- [ ] **Step 5: Commit projection infrastructure**

```bash
git add apps/api/src/eventing
git commit -m "feat(api): add ordered projection runners"
```

---

### Task 4: Durable Outbox and worker leases

**Files:**
- Create: `apps/api/src/eventing/outbox-worker.ts`
- Create: `apps/api/src/eventing/outbox-worker.integration.test.ts`
- Modify: `apps/api/src/eventing/event-store.ts`
- Modify: `apps/api/src/eventing/event-types.ts`
- Modify: `apps/api/src/eventing/index.ts`

**Interfaces:**
- Consumes: `OutboxIntent`, `eventOutbox`.
- Produces: `EventStoreSession.enqueueOutbox()`, `OutboxHandlerRegistry.register()` and `OutboxWorker.runOnce()`.

- [ ] **Step 1: Write failing Outbox tests**

```ts
it('leases and completes one available message', async () => {
  await enqueue({ id: 'outbox-1', handlerName: 'kernel-handler', payload: { value: 1 } })
  const processed = await worker.runOnce()
  expect(processed).toBe(1)
  await expect(readOutbox('outbox-1')).resolves.toMatchObject({ status: 'completed', attemptCount: 1 })
})

it('returns a failed message to pending with exponential backoff', async () => {
  handler.mockRejectedValueOnce(new Error('temporary'))
  await worker.runOnce()
  await expect(readOutbox('outbox-1')).resolves.toMatchObject({ status: 'pending', attemptCount: 1, lastError: 'temporary' })
})

it('does not deliver one lease to two workers', async () => {
  const counts = await Promise.all([firstWorker.runOnce(), secondWorker.runOnce()])
  expect(counts.reduce((sum, value) => sum + value, 0)).toBe(1)
})
```

Also test expired lease recovery, unknown handler failure, maximum-attempt terminal failure, and duplicate enqueue ID idempotency.

- [ ] **Step 2: Run tests and observe missing worker failure**

Run: `pnpm --filter @ai-novel/api test -- src/eventing/outbox-worker.integration.test.ts`  
Expected: FAIL.

- [ ] **Step 3: Implement enqueue and worker behavior**

```ts
export class OutboxWorker {
  constructor(options: {
    workerId: string
    handlers: OutboxHandlerRegistry
    leaseMs?: number
    maxAttempts?: number
    batchSize?: number
  })

  runOnce(): Promise<number>
}
```

Claim rows with `FOR UPDATE SKIP LOCKED`, set `processing` and lease fields in one transaction, execute outside the claim transaction, then mark `completed`, return to `pending` with exponential backoff, or mark terminal `failed`.

- [ ] **Step 4: Run focused tests**

Run: `pnpm --filter @ai-novel/api test -- src/eventing/outbox-worker.integration.test.ts`  
Expected: PASS.

- [ ] **Step 5: Commit Outbox infrastructure**

```bash
git add apps/api/src/eventing
git commit -m "feat(api): add durable event outbox"
```

---

### Task 5: Transactional Command Bus and command receipts

**Files:**
- Create: `apps/api/src/eventing/command-bus.ts`
- Create: `apps/api/src/eventing/command-bus.integration.test.ts`
- Modify: `apps/api/src/eventing/event-store.ts`
- Modify: `apps/api/src/eventing/projection-runner.ts`
- Modify: `apps/api/src/eventing/index.ts`

**Interfaces:**
- Consumes: Event Store transaction sessions, `ProjectionRegistry`, `CommandEnvelope`, `CommandDecision`, `commandReceipts`, Outbox enqueue.
- Produces: `CommandBus.register()` and `CommandBus.dispatch<TResult>()`.

- [ ] **Step 1: Write failing Command Bus tests**

```ts
it('appends events, projects them, enqueues effects, and stores the result atomically', async () => {
  bus.register('CreateKernelThing', async command => ({
    streams: [createStreamAppend(command)],
    result: { id: command.aggregateId },
    outbox: [{ id: 'effect-1', eventId: 'event-1', handlerName: 'notify', payload: {} }],
  }))
  await expect(bus.dispatch(command)).resolves.toEqual({ id: command.aggregateId })
  await expect(readReceipt(command.commandId)).resolves.toMatchObject({ status: 'completed' })
  await expect(store.loadStream(stream)).resolves.toHaveLength(1)
  expect(projectedIds).toEqual([command.aggregateId])
})

it('returns the stored result for a duplicate completed command', async () => {
  const first = await bus.dispatch(command)
  const second = await bus.dispatch(command)
  expect(second).toEqual(first)
  expect(handler).toHaveBeenCalledTimes(1)
})

it('rolls back events, projections, outbox, and receipt when a sync projector fails', async () => {
  projector.mockRejectedValue(new Error('projection failed'))
  await expect(bus.dispatch(command)).rejects.toThrow('projection failed')
  await expect(store.loadStream(stream)).resolves.toHaveLength(0)
  await expect(readOutboxRows()).resolves.toHaveLength(0)
})
```

Also test unknown commands, persisted `DomainCommandError`, transient errors not becoming terminal receipts, and project metadata propagation.

- [ ] **Step 2: Run tests and observe missing Command Bus failure**

Run: `pnpm --filter @ai-novel/api test -- src/eventing/command-bus.integration.test.ts`  
Expected: FAIL.

- [ ] **Step 3: Implement the handler registry and dispatch transaction**

```ts
export type CommandHandler<TPayload extends JsonObject, TResult> = (
  command: CommandEnvelope<TPayload>,
  context: CommandHandlerContext,
) => Promise<CommandDecision<TResult>>

export interface CommandHandlerContext {
  session: EventStoreSession
}

export class CommandBus {
  register<TPayload extends JsonObject, TResult>(commandType: string, handler: CommandHandler<TPayload, TResult>): void
  dispatch<TResult>(command: CommandEnvelope): Promise<TResult>
}
```

`dispatch` checks a receipt, executes the handler, appends events, runs synchronous projectors, enqueues effects and inserts the completed receipt in one database transaction. Store deterministic `DomainCommandError` failures in a separate transaction; do not persist infrastructure or concurrency failures as terminal command results.

- [ ] **Step 4: Run focused tests and typecheck**

Run: `pnpm --filter @ai-novel/api test -- src/eventing/command-bus.integration.test.ts`  
Expected: PASS.

Run: `pnpm --filter @ai-novel/api typecheck`  
Expected: PASS.

- [ ] **Step 5: Commit Command Bus**

```bash
git add apps/api/src/eventing
git commit -m "feat(api): add transactional command bus"
```

---

### Task 6: Aggregate repository and snapshots

**Files:**
- Create: `apps/api/src/eventing/aggregate-repository.ts`
- Create: `apps/api/src/eventing/aggregate-repository.test.ts`
- Modify: `apps/api/src/eventing/index.ts`

**Interfaces:**
- Consumes: `EventRegistry`, Event Store streams and snapshots.
- Produces: `AggregateDefinition<TState>` and `AggregateRepository.load()`.

- [ ] **Step 1: Write failing aggregate loading tests**

```ts
it('reduces decoded stream events into aggregate state', async () => {
  const loaded = await repository.load(definition, stream)
  expect(loaded).toEqual({ state: { title: '修订标题' }, version: 2 })
})

it('starts from a snapshot and applies only later events', async () => {
  await storeSnapshot({ aggregateVersion: 10, state: { count: 10 } })
  const loaded = await repository.load(counterDefinition, stream)
  expect(reducer).toHaveBeenCalledTimes(2)
  expect(loaded).toEqual({ state: { count: 12 }, version: 12 })
})
```

Also test unknown event types, invalid snapshot versions, empty streams using `initialState`, and snapshot creation at the configured interval.

- [ ] **Step 2: Run tests and observe missing repository failure**

Run: `pnpm --filter @ai-novel/api test -- src/eventing/aggregate-repository.test.ts`  
Expected: FAIL.

- [ ] **Step 3: Implement pure aggregate definitions and repository loading**

```ts
export interface AggregateDefinition<TState> {
  aggregateType: string
  initialState: () => TState
  evolve: (state: TState, event: StoredEvent) => TState
  snapshotEvery: number
}

export class AggregateRepository {
  load<TState>(definition: AggregateDefinition<TState>, stream: StreamRef): Promise<{
    state: TState
    version: number
  }>
}
```

Decode and upcast each event before `evolve`. Never mutate the previous state object inside the repository.

- [ ] **Step 4: Run focused tests**

Run: `pnpm --filter @ai-novel/api test -- src/eventing/aggregate-repository.test.ts`  
Expected: PASS.

- [ ] **Step 5: Commit aggregate repository**

```bash
git add apps/api/src/eventing
git commit -m "feat(api): add aggregate snapshot repository"
```

---

### Task 7: Deterministic projection replay

**Files:**
- Create: `apps/api/src/eventing/replay.ts`
- Create: `apps/api/src/eventing/replay.integration.test.ts`
- Modify: `apps/api/src/eventing/projection-runner.ts`
- Modify: `apps/api/src/eventing/index.ts`

**Interfaces:**
- Consumes: `ProjectionRegistry`, Event Store global reads and checkpoints.
- Produces: `replayProjection(name, options)` and `replayAll(options)`.

- [ ] **Step 1: Write failing replay tests**

```ts
it('resets and rebuilds one projection deterministically', async () => {
  await projectAllEvents()
  const before = normalizeProjection(await readProjection())
  await replayProjection('kernel-replay')
  const after = normalizeProjection(await readProjection())
  expect(after).toEqual(before)
})

it('can replay only one project while preserving other project rows', async () => {
  await replayProjection('kernel-replay', { projectId: 'project-a' })
  expect(await readProjectProjection('project-b')).toEqual(projectBBefore)
})
```

Also test an empty event store, bounded batch sizes, checkpoint reset, and failure leaving a diagnostic error.

- [ ] **Step 2: Run tests and observe missing replay failure**

Run: `pnpm --filter @ai-novel/api test -- src/eventing/replay.integration.test.ts`  
Expected: FAIL.

- [ ] **Step 3: Implement replay functions**

```ts
export interface ReplayOptions {
  projectId?: string
  batchSize?: number
}

export interface ReplayResult {
  projectionName: string
  processedEvents: number
  lastGlobalPosition: number
}

export function replayProjection(name: string, options?: ReplayOptions): Promise<ReplayResult>
export function replayAll(options?: ReplayOptions): Promise<ReplayResult[]>
```

Reset the selected projection and its checkpoint, read events in `globalPosition` order, apply matching handlers, and record the final position. Project-scoped replay requires the projection definition to provide a project-scoped reset function.

- [ ] **Step 4: Run focused tests**

Run: `pnpm --filter @ai-novel/api test -- src/eventing/replay.integration.test.ts`  
Expected: PASS.

- [ ] **Step 5: Commit replay support**

```bash
git add apps/api/src/eventing
git commit -m "feat(api): add deterministic projection replay"
```

---

### Task 8: Architecture gates, coverage, documentation, and phase verification

**Files:**
- Modify: `apps/api/src/architecture.test.ts`
- Modify: `apps/api/vitest.config.ts`
- Modify: `docs/architecture/overview.md`
- Modify: `docs/standards/engineering.md`
- Modify: `docs/guides/local-development.md`
- Modify: `docs/superpowers/plans/2026-08-11-eventing-kernel-implementation.md`

**Interfaces:**
- Consumes: completed Eventing Kernel.
- Produces: enforceable dependency boundaries and documented migration/replay workflow.

- [ ] **Step 1: Add failing architecture tests**

```ts
it('keeps eventing independent from domain modules', () => {
  const eventingSources = sourceFiles(join(sourceRoot, 'eventing'))
    .filter(file => !file.endsWith('.test.ts'))
    .map(file => readFileSync(file, 'utf8'))
    .join('\n')
  expect(eventingSources).not.toMatch(/from ['"].*modules\//)
})

it('restricts eventing table writes to eventing infrastructure', () => {
  const nonEventingSources = sourceFiles(sourceRoot)
    .filter(file => !file.includes('/eventing/'))
    .filter(file => !file.includes('/db/schema/'))
    .map(file => readFileSync(file, 'utf8'))
    .join('\n')
  expect(nonEventingSources).not.toMatch(/\b(?:domainEvents|aggregateStreams|eventOutbox|commandReceipts)\b/)
})
```

- [ ] **Step 2: Run architecture tests and confirm the new gate is active**

Run: `pnpm --filter @ai-novel/api test -- src/architecture.test.ts`  
Expected: PASS after the kernel boundaries are correct; deliberately importing a domain module in a temporary local edit must make the first assertion fail, then remove that edit.

- [ ] **Step 3: Add Eventing coverage inclusion and thresholds**

Add `src/eventing/**/*.ts` to Vitest coverage includes. Exclude only barrel exports and test helpers. Set per-file or directory thresholds so Eventing statements and branches are at least 90% without lowering existing global thresholds.

- [ ] **Step 4: Document the kernel**

Update architecture documentation with the dependency direction:

```text
routes → command bus / queries
command bus → aggregates + event store + sync projectors + outbox
eventing → config + db + shared
eventing -X→ modules
```

Document additive migration, `_test` database guard, outbox worker behavior and projection replay commands. Do not describe product domains as migrated during this phase.

- [ ] **Step 5: Mark completed plan checkboxes and run focused coverage**

Run: `pnpm --filter @ai-novel/api test:coverage`  
Expected: all API tests pass and Eventing statements/branches meet 90%.

- [ ] **Step 6: Run the repository verification gate**

Run: `pnpm check`  
Expected: lint, typecheck, build and all tests PASS.

Run: `pnpm test:coverage`  
Expected: all workspace coverage gates PASS.

Run: `git diff --check`  
Expected: no whitespace errors.

- [ ] **Step 7: Commit phase verification and documentation**

```bash
git add apps/api/src/architecture.test.ts apps/api/vitest.config.ts docs
git commit -m "docs: establish eventing kernel boundaries"
```

---

## Phase Completion Gate

The Eventing Kernel phase is complete only when:

1. Multi-stream event appends are atomic and reject stale versions.
2. `domain_events` rejects database updates and deletes.
3. Duplicate commands return the stored completed result.
4. Synchronous projection failure rolls back events, projections, outbox and receipts.
5. Outbox leasing and retries are deterministic and duplicate-safe.
6. Aggregate loading uses snapshots and upcasters.
7. A projection can be cleared and rebuilt to the same normalized result.
8. Eventing coverage is at least 90% for statements and branches.
9. `pnpm check` and `pnpm test:coverage` pass.
10. No current product API behavior has changed.

The next plan after this gate is `Project and Settings Event-Sourcing Migration`, which will introduce the first real aggregates and projections while keeping current HTTP contracts.
