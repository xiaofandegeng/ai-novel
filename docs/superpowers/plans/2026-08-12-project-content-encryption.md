# 项目内容加密与删除 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 使用每项目数据密钥保护事件、快照和命令回执，并在项目删除时通过销毁密钥实现不可恢复删除。

**Architecture:** 纯密码模块负责 AES-256-GCM 与 AAD；数据库 Key Store 负责包装后的项目数据密钥；Eventing Content Protector 作为 Event Store/Command Bus 的唯一加解密边界。领域模块只声明事件保护级别，Project 删除事件触发同事务密钥销毁，Replay 先识别删除 tombstone 再跳过对应项目。

**Tech Stack:** TypeScript、Node `crypto`、Drizzle ORM、PostgreSQL、Vitest

## Global Constraints

- 用户已授权清空本地开发数据库，不实现明文历史事件转换。
- `PROJECT_CONTENT_MASTER_KEY` 与 `AI_CREDENTIAL_MASTER_KEY` 必须分离。
- `domain_events`、`aggregate_snapshots`、`command_receipts` 中不得存在用户内容明文副本。
- Eventing 基础设施不得反向导入领域模块。
- 所有 schema 变更必须生成 Drizzle migration。
- 每个生产行为先写失败测试，观察正确失败后再实现。

---

### Task 1: 主密钥配置与纯密码原语

**Files:**
- Create: `apps/api/src/security/project-content-crypto.ts`
- Create: `apps/api/src/security/project-content-crypto.test.ts`
- Modify: `apps/api/src/config/environment.ts`
- Modify: `apps/api/src/config/environment.test.ts`
- Modify: `apps/api/vitest.config.ts`
- Modify: `.env.example`

**Interfaces:**
- Produces: `parseProjectContentMasterKey(value: string | undefined): Buffer`
- Produces: `encryptProjectJson(input: ProjectJsonEncryptionInput): EncryptedJsonEnvelope`
- Produces: `decryptProjectJson(input: ProjectJsonDecryptionInput): JsonObject`
- Produces: `generateProjectDataKey(): Buffer`

- [ ] **Step 1: Write the failing configuration and crypto tests**

```ts
it('rejects a missing or non-256-bit project content master key', () => {
  expect(() => parseProjectContentMasterKey(undefined)).toThrow('PROJECT_CONTENT_MASTER_KEY')
  expect(() => parseProjectContentMasterKey(Buffer.alloc(31).toString('base64'))).toThrow('32 bytes')
})

it('authenticates ciphertext with project and event AAD', () => {
  const key = Buffer.alloc(32, 7)
  const envelope = encryptProjectJson({ key, value: { title: '雾港' }, aad: 'project-a|event-1' })
  expect(JSON.stringify(envelope)).not.toContain('雾港')
  expect(decryptProjectJson({ key, envelope, aad: 'project-a|event-1' })).toEqual({ title: '雾港' })
  expect(() => decryptProjectJson({ key, envelope, aad: 'project-b|event-1' })).toThrow()
})
```

- [ ] **Step 2: Run the tests and verify RED**

Run: `pnpm --filter @ai-novel/api test -- src/security/project-content-crypto.test.ts src/config/environment.test.ts`

Expected: FAIL because the parser and crypto module do not exist.

- [ ] **Step 3: Implement the exact crypto contract**

```ts
export interface EncryptedJsonEnvelope extends JsonObject {
  encrypted: true
  algorithm: 'aes-256-gcm'
  keyVersion: 1
  iv: string
  ciphertext: string
  authTag: string
}

export interface ProjectJsonEncryptionInput {
  key: Buffer
  value: JsonObject
  aad: string
}
```

Use a fresh 12-byte IV for every encryption, `createCipheriv('aes-256-gcm', key, iv)`, UTF-8 JSON, explicit AAD, and `timingSafeEqual` only where byte comparison is needed. Add `getProjectContentMasterKey()` to `environment.ts`; validate it before API runtime construction. Set an isolated 32-byte test key in `vitest.config.ts`.

- [ ] **Step 4: Run the tests and verify GREEN**

Run: `pnpm --filter @ai-novel/api test -- src/security/project-content-crypto.test.ts src/config/environment.test.ts`

Expected: all selected tests pass.

- [ ] **Step 5: Commit**

```bash
git add .env.example apps/api/src/config/environment.ts apps/api/src/config/environment.test.ts apps/api/src/security/project-content-crypto.ts apps/api/src/security/project-content-crypto.test.ts apps/api/vitest.config.ts
git commit -m "feat(security): add project content crypto primitives"
```

### Task 2: 项目数据密钥表与 Key Store

**Files:**
- Create: `apps/api/src/db/schema/project-data-key.ts`
- Modify: `apps/api/src/db/schema/index.ts`
- Create: `apps/api/src/security/project-data-key.store.ts`
- Create: `apps/api/src/security/project-data-key.store.integration.test.ts`
- Create: `apps/api/drizzle/0044_*.sql` via Drizzle
- Modify: `apps/api/drizzle/meta/_journal.json` via Drizzle
- Create: `apps/api/drizzle/meta/0044_snapshot.json` via Drizzle

**Interfaces:**
- Produces: `ProjectDataKeyStore.ensure(transaction, projectId): Promise<ProjectDataKey>`
- Produces: `ProjectDataKeyStore.resolve(executor, projectId): Promise<ProjectDataKey>`
- Produces: `ProjectDataKeyStore.destroy(transaction, projectId, destroyedAt): Promise<void>`
- Produces: `ProjectDataKeyDestroyedError`

- [ ] **Step 1: Write the failing Key Store integration test**

```ts
it('creates one wrapped key and destroys it without deleting the tombstone', async () => {
  await store.withTransaction(async (session) => {
    const first = await keys.ensure(session.transaction, 'project-a')
    const second = await keys.ensure(session.transaction, 'project-a')
    expect(second.key).toEqual(first.key)
    await keys.destroy(session.transaction, 'project-a', '2026-08-12T00:00:00.000Z')
  })
  await expect(keys.resolve(db, 'project-a')).rejects.toBeInstanceOf(ProjectDataKeyDestroyedError)
  const [row] = await db.select().from(projectDataKeys)
  expect(row).toMatchObject({ projectId: 'project-a', wrappedKey: null })
})
```

- [ ] **Step 2: Run the test and verify RED**

Run: `pnpm --filter @ai-novel/api test -- src/security/project-data-key.store.integration.test.ts`

Expected: FAIL because the schema and Key Store do not exist.

- [ ] **Step 3: Add schema, constraints, migration, and Key Store**

Define `project_data_keys` with `projectId`, nullable `wrappedKey`, `keyVersion`, `algorithm`, `createdAt`, `destroyedAt` and a SQL check enforcing exactly one active/destroyed shape. Do not add a foreign key to a rebuildable project projection: the key tombstone must survive projection reset and project-row deletion. Wrap each data key with the configured master key using AAD `project-data-key|<projectId>|1`. Cache no plaintext keys across requests.

Run: `pnpm db:generate`

Expected: Drizzle creates migration `0044_*` containing the table and active/destroyed check.

- [ ] **Step 4: Run the integration test and verify GREEN**

Run: `pnpm --filter @ai-novel/api test -- src/security/project-data-key.store.integration.test.ts`

Expected: all selected tests pass, including cross-project unwrap rejection.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/db/schema apps/api/src/security/project-data-key.store.ts apps/api/src/security/project-data-key.store.integration.test.ts apps/api/drizzle
git commit -m "feat(security): persist wrapped project data keys"
```

### Task 3: Event Registry 保护声明与 Content Protector

**Files:**
- Modify: `apps/api/src/eventing/event-registry.ts`
- Modify: `apps/api/src/eventing/event-registry.test.ts`
- Modify: `apps/api/src/eventing/event-types.ts`
- Create: `apps/api/src/eventing/content-protector.ts`
- Create: `apps/api/src/eventing/content-protector.integration.test.ts`
- Modify: `apps/api/src/eventing/index.ts`

**Interfaces:**
- Produces: `EventPayloadProtection = 'none' | 'project-content'`
- Produces: `EventRegistry.protectionFor(eventType): EventPayloadProtection`
- Produces: `EventingContentProtector.protectEvent/unprotectEvent`
- Produces: `protectSnapshot/unprotectSnapshot`
- Produces: `protectReceiptResult/unprotectReceiptResult`
- Produces: `finalizeBatch(transaction, events): Promise<void>`

- [ ] **Step 1: Write failing registry and protector tests**

```ts
registry.register({
  eventType: 'SecretChanged',
  currentSchemaVersion: 1,
  payloadProtection: 'project-content',
  upcasters: {},
  validate: payload => payload as JsonObject,
})
expect(registry.protectionFor('SecretChanged')).toBe('project-content')
```

The integration test must protect `{ chapter: '只有数据库不应看见的正文' }`, assert the raw JSON does not contain that string, and unprotect to the original object.

- [ ] **Step 2: Run the tests and verify RED**

Run: `pnpm --filter @ai-novel/api test -- src/eventing/event-registry.test.ts src/eventing/content-protector.integration.test.ts`

Expected: FAIL because event definitions have no protection field and the protector is absent.

- [ ] **Step 3: Implement protection interfaces and stable AAD builders**

```ts
export interface EventingContentProtector {
  protectEvent(executor: EventingExecutor, event: StoredEvent): Promise<JsonObject>
  unprotectEvent(executor: EventingExecutor, event: StoredEvent): Promise<JsonObject>
  protectSnapshot(executor: EventingExecutor, snapshot: AggregateSnapshot): Promise<JsonObject>
  unprotectSnapshot(executor: EventingExecutor, snapshot: AggregateSnapshot): Promise<JsonObject>
  protectReceiptResult(executor: EventingExecutor, command: CommandEnvelope, result: JsonObject): Promise<JsonObject>
  unprotectReceiptResult(executor: EventingExecutor, receipt: CommandReceiptRecord): Promise<JsonObject>
  finalizeBatch(executor: EventingExecutor, events: StoredEvent[]): Promise<void>
}
```

Provide `NoopEventingContentProtector` for isolated infrastructure tests and `ProjectEventingContentProtector` for runtime. The project protector consults `EventRegistry.protectionFor`, creates a key only for `ProjectCreated`, and recognizes `ProjectDeleted` during finalization.

- [ ] **Step 4: Run the tests and verify GREEN**

Run: `pnpm --filter @ai-novel/api test -- src/eventing/event-registry.test.ts src/eventing/content-protector.integration.test.ts`

Expected: all selected tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/eventing
git commit -m "feat(eventing): add project content protection boundary"
```

### Task 4: Event Store 的事件与快照加密

**Files:**
- Modify: `apps/api/src/eventing/event-store.ts`
- Modify: `apps/api/src/eventing/event-store.integration.test.ts`
- Modify: `apps/api/src/eventing/aggregate-repository.test.ts`
- Modify: `apps/api/src/eventing-runtime.ts`

**Interfaces:**
- Consumes: `EventingContentProtector`
- Produces: Event Store 返回解密后的 `StoredEvent`，数据库保存加密信封
- Produces: `EventStore.readHeadersForDeletedProjects(): Promise<Set<string>>`

- [ ] **Step 1: Write failing raw-storage and snapshot tests**

Create a protected `ProjectCreated` followed by a protected `ChapterCreated`. Assert SQL-selected `domain_events.payload` and `aggregate_snapshots.state` do not contain the title/body, while `loadStream()` and `AggregateRepository.load()` return the original values.

- [ ] **Step 2: Run the tests and verify RED**

Run: `pnpm --filter @ai-novel/api test -- src/eventing/event-store.integration.test.ts src/eventing/aggregate-repository.test.ts`

Expected: FAIL because raw rows still contain plaintext.

- [ ] **Step 3: Wire Content Protector into all Event Store session paths**

Compute aggregate versions before protection so event AAD is stable. Protect before insert; unprotect returned rows before synchronous projection. Apply the same boundary in public/session `loadStream`, `readAll`, `getSnapshot`, and `putSnapshot`. Construct runtime in this order: registry → key store/protector → store → projections/command bus/repository.

- [ ] **Step 4: Run the tests and verify GREEN**

Run: `pnpm --filter @ai-novel/api test -- src/eventing/event-store.integration.test.ts src/eventing/aggregate-repository.test.ts`

Expected: raw storage is encrypted and aggregate behavior remains unchanged.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/eventing apps/api/src/eventing-runtime.ts
git commit -m "feat(eventing): encrypt events and snapshots at rest"
```

### Task 5: 命令回执保护与原子密钥销毁

**Files:**
- Modify: `apps/api/src/eventing/event-types.ts`
- Modify: `apps/api/src/eventing/command-bus.ts`
- Modify: `apps/api/src/eventing/command-bus.integration.test.ts`
- Modify: `apps/api/src/modules/project/project.eventing.ts`
- Modify: `apps/api/src/modules/project/project.eventing.integration.test.ts`
- Modify: `apps/api/src/modules/project/projects.routes.ts`
- Modify: `packages/shared/src/types/novel.ts`

**Interfaces:**
- Produces: `CommandDecision.receiptProtection?: 'none' | 'project-content'`
- Produces: `DeleteProjectResult = { id: string, deleted: true, deletedAt: string }`

- [ ] **Step 1: Write failing idempotence, raw receipt, and delete tests**

```ts
const first = await bus.dispatch<ProjectSnapshot>(protectedCommand)
const second = await bus.dispatch<ProjectSnapshot>(protectedCommand)
expect(second).toEqual(first)
const [receipt] = await db.select().from(commandReceipts).where(eq(commandReceipts.commandId, protectedCommand.commandId))
expect(JSON.stringify(receipt.result)).not.toContain(first.title)
```

Delete test: after `DeleteProject`, assert `wrappedKey` is null, projections and credentials are gone, returned result is only `{ id, deleted: true, deletedAt }`, and a repeated domain command returns `PROJECT_NOT_FOUND` without decryption.

- [ ] **Step 2: Run the tests and verify RED**

Run: `pnpm --filter @ai-novel/api test -- src/eventing/command-bus.integration.test.ts src/modules/project/project.eventing.integration.test.ts`

Expected: FAIL because receipts are plaintext and deletion does not destroy the project key.

- [ ] **Step 3: Protect receipts and finalize security after receipt insertion**

For project-scoped commands, default `receiptProtection` to `project-content`. The delete decision explicitly uses `none` and returns `DeleteProjectResult`. Insert the protected receipt, then call `session.finalizeContentProtection(events)` before transaction commit; `ProjectDeleted` finalization nulls the wrapped key. Failed receipts contain only stable error codes and generic messages.

- [ ] **Step 4: Run the tests and verify GREEN**

Run: `pnpm --filter @ai-novel/api test -- src/eventing/command-bus.integration.test.ts src/modules/project/project.eventing.integration.test.ts`

Expected: receipt idempotence works before deletion, delete is atomic, and no protected result is stored in plaintext.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/eventing apps/api/src/modules/project packages/shared/src/types/novel.ts
git commit -m "feat(security): protect receipts and shred deleted projects"
```

### Task 6: 为全部领域事件声明保护级别

**Files:**
- Modify: `apps/api/src/modules/project/project.eventing.ts`
- Modify: `apps/api/src/modules/ai/ai-operations.eventing.ts`
- Modify: `apps/api/src/modules/ai/project-settings.eventing.ts`
- Modify: `apps/api/src/modules/ai/prompt-settings.eventing.ts`
- Modify: `apps/api/src/modules/story/story-structure.eventing.ts`
- Modify: `apps/api/src/modules/story/chapter.eventing.ts`
- Modify: `apps/api/src/modules/story/chapter-knowledge.eventing.ts`
- Modify: `apps/api/src/modules/character/character.eventing.ts`
- Modify: `apps/api/src/modules/character/relationship.eventing.ts`
- Modify: `apps/api/src/modules/narrative/conflict.eventing.ts`
- Modify: `apps/api/src/modules/narrative/foreshadowing.eventing.ts`
- Modify: `apps/api/src/modules/narrative/narrative-knowledge.eventing.ts`
- Modify: `apps/api/src/modules/automation/writing-job.eventing.ts`
- Modify: `apps/api/src/modules/automation/autonomous-run.eventing.ts`
- Modify: `apps/api/src/modules/automation/chapter-change-set.eventing.ts`
- Modify: `apps/api/src/modules/automation/postprocess.eventing.ts`
- Modify: `apps/api/src/architecture.test.ts`

**Interfaces:**
- Consumes: required `EventDefinition.payloadProtection`
- Produces: every registered event is explicitly classified

- [ ] **Step 1: Strengthen the architecture test**

Add a source-level assertion that every `events.register({ ... })` block contains `payloadProtection`, and a runtime assertion that registered project-content events report the expected classification. Deletion timestamps may be `none`; every event carrying domain snapshots, prompts, AI candidates, exceptions or narrative content must be `project-content`.

- [ ] **Step 2: Run the test and verify RED**

Run: `pnpm --filter @ai-novel/api test -- src/architecture.test.ts`

Expected: FAIL listing event registrations without protection declarations.

- [ ] **Step 3: Classify every event registration**

Add `payloadProtection: 'project-content'` to domain content events. Use `payloadProtection: 'none'` only for payloads limited to timestamps, state tokens, counters or IDs; inspect validators to ensure no title, description, prompt, error detail or generated content is present.

- [ ] **Step 4: Run architecture and domain event tests**

Run: `pnpm --filter @ai-novel/api test -- src/architecture.test.ts src/modules`

Expected: all selected tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/architecture.test.ts apps/api/src/modules
git commit -m "refactor(eventing): classify all event payload protection"
```

### Task 7: 删除 tombstone 感知 Replay 与安全扫描

**Files:**
- Modify: `apps/api/src/eventing/replay.ts`
- Modify: `apps/api/src/eventing/replay.integration.test.ts`
- Create: `apps/api/src/scripts/verify-content-encryption.ts`
- Create: `apps/api/src/scripts/verify-content-encryption.integration.test.ts`
- Modify: `apps/api/package.json`
- Modify: `package.json`

**Interfaces:**
- Produces: `ProjectionReplay` skips all events for deleted projects before decryption
- Produces: `verifyContentEncryption(projectId?, knownPlaintexts?): Promise<EncryptionVerificationReport>`
- Produces: root command `pnpm db:verify-encryption`

- [ ] **Step 1: Write failing replay and scanner tests**

Create one active and one deleted encrypted project, reset projections, replay all, and assert only the active project returns. Insert a deliberately plaintext protected-event fixture inside a rolled-back test transaction and assert the scanner reports its event ID.

- [ ] **Step 2: Run the tests and verify RED**

Run: `pnpm --filter @ai-novel/api test -- src/eventing/replay.integration.test.ts src/scripts/verify-content-encryption.integration.test.ts`

Expected: FAIL because replay attempts to decrypt the deleted project and no scanner exists.

- [ ] **Step 3: Implement two-pass deleted-project discovery and scanner**

The first pass reads only clear headers for `ProjectDeleted`; the second pass reads/decrypts events while excluding that project set. The scanner checks envelope shape for every event definition marked `project-content`, every project snapshot, and every completed project-scoped receipt. It reports IDs and categories only, never raw values.

- [ ] **Step 4: Run the tests and verify GREEN**

Run: `pnpm --filter @ai-novel/api test -- src/eventing/replay.integration.test.ts src/scripts/verify-content-encryption.integration.test.ts`

Expected: deleted projects remain absent and malformed/plain rows are detected.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/eventing apps/api/src/scripts apps/api/package.json package.json
git commit -m "feat(eventing): replay around cryptographic tombstones"
```

### Task 8: Seed、导出、文档与阶段交接

**Files:**
- Modify: `apps/api/src/scripts/seed.ts`
- Modify: `apps/api/src/scripts/seed.integration.test.ts`
- Modify: `apps/api/src/modules/project/project-export.service.ts`
- Modify: `apps/api/src/app.integration.test.ts`
- Modify: `docs/guides/local-development.md`
- Modify: `docs/architecture/overview.md`
- Modify: `docs/standards/engineering.md`
- Modify: `docs/status/development-memory.md`
- Modify: `docs/status/handoff.md`

**Interfaces:**
- Produces: seed creates protected product events and survives replay
- Produces: project export never exposes envelopes, key refs or credential refs

- [ ] **Step 1: Write failing seed/export assertions**

Extend seed integration to scan for known seed title/body in raw eventing tables. Extend HTTP export test to recursively reject keys named `wrappedKey`, `ciphertext`, `authTag`, `credentialRef`, or `embeddingCredentialRef`.

- [ ] **Step 2: Run the tests and verify RED**

Run: `pnpm --filter @ai-novel/api test -- src/scripts/seed.integration.test.ts src/app.integration.test.ts`

Expected: FAIL until seed runtime and export sanitization use the protected path.

- [ ] **Step 3: Route seed through protected runtime and sanitize export**

Do not add direct table writes. Document master-key generation, startup failure behavior, deletion irreversibility, scanner usage and the no-conversion reset path. Record exact completed commits and next plan in memory/handoff.

- [ ] **Step 4: Run the phase tests**

Run: `pnpm --filter @ai-novel/api test -- src/security src/eventing src/modules/project src/scripts/seed.integration.test.ts src/app.integration.test.ts`

Expected: all selected tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/scripts apps/api/src/modules/project docs
git commit -m "docs(security): record encrypted event baseline"
```
