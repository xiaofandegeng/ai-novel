# Worker 可靠性与 Provider 协议 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 Outbox Worker 可恢复、可停止、可观测，并用本地协议服务器自动验证真实 OpenAI-compatible HTTP/SSE 行为。

**Architecture:** `OutboxRuntime` 管理轮询、单飞 drain、心跳和优雅退出，`OutboxWorker` 继续只负责租约领取与处理。健康查询只聚合事件位置、投影、Outbox 和 Worker 心跳。AI HTTP 协议从大 `ai.service.ts` 中抽到可注入、可取消的 provider 模块；真实 smoke 使用显式项目 ID 和开关。

**Tech Stack:** TypeScript、Node HTTP、OpenAI SDK、Hono、Drizzle ORM、PostgreSQL、Vitest

## Global Constraints

- 本计划依赖“项目内容加密与删除”计划完成。
- Outbox payload 只保存项目、流程、阶段和请求 ID，不保存 Prompt、正文或候选内容。
- Worker 不能直接写领域投影。
- 默认测试不得访问公网或消费真实 AI 额度。
- 健康响应和错误日志不得泄露密钥、Prompt、正文或 Provider 原始响应。
- 每个生产行为先写失败测试，观察正确失败后再实现。

---

### Task 1: Worker 心跳 schema 与 OutboxRuntime 生命周期

**Files:**
- Create: `apps/api/src/db/schema/workflow-runtime.ts`
- Modify: `apps/api/src/db/schema/index.ts`
- Create: `apps/api/src/eventing/outbox-runtime.ts`
- Create: `apps/api/src/eventing/outbox-runtime.integration.test.ts`
- Modify: `apps/api/src/eventing/outbox-worker.ts`
- Modify: `apps/api/src/eventing/index.ts`
- Create: `apps/api/drizzle/0045_*.sql` via Drizzle
- Modify: `apps/api/drizzle/meta/_journal.json` via Drizzle
- Create: `apps/api/drizzle/meta/0045_snapshot.json` via Drizzle

**Interfaces:**
- Produces: `OutboxRuntime.start(): Promise<void>`
- Produces: `OutboxRuntime.wake(): Promise<void>`
- Produces: `OutboxRuntime.stop(): Promise<void>`
- Produces: `OutboxWorker.countActiveLeases(): Promise<number>`

- [ ] **Step 1: Write the failing lifecycle integration tests**

```ts
it('recovers an expired processing lease and records an idle heartbeat', async () => {
  await insertExpiredOutboxMessage()
  await runtime.start()
  await runtime.wake()
  await runtime.stop()
  expect(await outboxStatus('message-1')).toBe('completed')
  expect(await heartbeat('test-worker')).toMatchObject({ status: 'idle', activeLeaseCount: 0 })
})

it('stop prevents new claims and waits for the active drain', async () => {
  const stop = runtime.stop()
  await expect(stop).resolves.toBeUndefined()
  await runtime.wake()
  expect(handler).toHaveBeenCalledTimes(1)
})
```

- [ ] **Step 2: Run the test and verify RED**

Run: `pnpm --filter @ai-novel/api test -- src/eventing/outbox-runtime.integration.test.ts`

Expected: FAIL because runtime lifecycle and heartbeat schema do not exist.

- [ ] **Step 3: Implement schema and single-flight runtime**

```ts
export type WorkerRuntimeStatus = 'starting' | 'running' | 'idle' | 'stopping' | 'stopped' | 'failed'

export interface OutboxRuntimeOptions {
  worker: OutboxWorker
  workerId: string
  intervalMs: number
  now?: () => Date
}
```

`start()` writes `starting`, runs one immediate drain (which already claims expired leases), starts an unref'd interval, then writes `idle`. `wake()` shares one in-flight promise. `stop()` clears the interval, refuses new drains, awaits the active drain, then writes `stopped`. Heartbeat errors are sanitized categories, not raw provider responses.

Run: `pnpm db:generate`

Expected: migration `0045_*` creates `workflow_worker_heartbeats` with a primary key on worker name and an index on `last_heartbeat_at`.

- [ ] **Step 4: Run the test and verify GREEN**

Run: `pnpm --filter @ai-novel/api test -- src/eventing/outbox-runtime.integration.test.ts src/eventing/outbox-worker.integration.test.ts`

Expected: lifecycle and existing worker lease tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/db/schema apps/api/src/eventing apps/api/drizzle
git commit -m "feat(eventing): add observable outbox runtime"
```

### Task 2: 脱敏工作流健康查询

**Files:**
- Create: `packages/shared/src/types/workflow-health.ts`
- Modify: `packages/shared/src/types/index.ts`
- Modify: `packages/shared/src/index.test.ts`
- Create: `apps/api/src/modules/automation/workflow-health.service.ts`
- Create: `apps/api/src/modules/automation/workflow-health.routes.ts`
- Create: `apps/api/src/modules/automation/workflow-health.service.integration.test.ts`
- Modify: `apps/api/src/modules/index.ts`
- Modify: `apps/api/src/app.integration.test.ts`

**Interfaces:**
- Produces: `WorkflowHealthPayload`
- Produces: `getWorkflowHealth(): Promise<WorkflowHealthPayload>`
- Produces: `GET /api/system/workflow-health`

- [ ] **Step 1: Write failing contract and service tests**

```ts
expect(await getWorkflowHealth()).toEqual(expect.objectContaining({
  eventStorePosition: expect.any(Number),
  projections: expect.any(Array),
  outbox: expect.objectContaining({ pending: 0, retrying: 0, processing: 0, failed: 0 }),
  workers: expect.any(Array),
  processManagers: expect.any(Array),
  provider: { chatConfigured: expect.any(Boolean), embeddingConfigured: expect.any(Boolean) },
}))
```

Recursively assert the HTTP JSON has no keys matching `/key|secret|payload|prompt|content|ciphertext/i`.

- [ ] **Step 2: Run the tests and verify RED**

Run: `pnpm --filter @ai-novel/shared test -- src/index.test.ts`

Run: `pnpm --filter @ai-novel/api test -- src/modules/automation/workflow-health.service.integration.test.ts src/app.integration.test.ts`

Expected: FAIL because the contract, service and route are absent.

- [ ] **Step 3: Implement bounded aggregate queries**

```ts
export interface WorkflowHealthPayload {
  status: 'healthy' | 'degraded' | 'failed'
  eventStorePosition: number
  projections: Array<{ name: string, position: number, lag: number, status: 'idle' | 'running' | 'failed' }>
  outbox: { pending: number, retrying: number, processing: number, failed: number, oldestPendingAt?: string }
  workers: Array<{ name: string, status: WorkerRuntimeStatus, lastHeartbeatAt: string, activeLeaseCount: number, lastErrorCode?: string }>
  processManagers: Array<{ name: string, lastSucceededAt?: string, status: 'idle' | 'active' | 'failed' }>
  provider: { chatConfigured: boolean, embeddingConfigured: boolean }
}
```

Derive `retrying` from pending messages with prior attempts and future availability. Derive Process Manager success from completed reference-only Outbox handlers without reading payloads. Derive overall status deterministically: `failed` for failed projection or terminal Outbox failure; `degraded` for lag, stale heartbeat, pending/retrying backlog or missing Provider; otherwise `healthy`.

- [ ] **Step 4: Run the tests and verify GREEN**

Run the two commands from Step 2 again.

Expected: shared and API selected tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/shared apps/api/src/modules/automation apps/api/src/modules/index.ts apps/api/src/app.integration.test.ts
git commit -m "feat(automation): expose sanitized workflow health"
```

### Task 3: OpenAI-compatible Provider 边界与本地协议服务器

**Files:**
- Create: `apps/api/src/modules/ai/openai-compatible-provider.ts`
- Create: `apps/api/src/modules/ai/openai-compatible-provider.contract.test.ts`
- Create: `apps/api/src/test/openai-compatible-test-server.ts`
- Modify: `apps/api/src/modules/ai/ai.service.ts`
- Modify: `apps/api/src/modules/ai/ai.routes.ts`

**Interfaces:**
- Produces: `OpenAICompatibleProvider.completeJson<T>(request): Promise<AICompletionResult<T>>`
- Produces: `OpenAICompatibleProvider.streamText(request): AsyncGenerator<string>`
- Consumes: `AbortSignal`, injected retry delay and configured OpenAI client

- [ ] **Step 1: Write the failing local protocol contract tests**

```ts
it.each(['json', 'sse', 'retry-429', 'retry-500', 'invalid-json', 'disconnect', 'timeout', 'abort'])('%s protocol case', async (scenario) => {
  server.setScenario(scenario)
  const result = runScenario(provider, scenario)
  await expectScenario(result, scenario)
})
```

The local Node server must bind to `127.0.0.1` on an ephemeral port and record request method, authorization presence, model, body and abort/disconnect state. Never record the authorization value.

- [ ] **Step 2: Run the contract test and verify RED**

Run: `pnpm --filter @ai-novel/api test -- src/modules/ai/openai-compatible-provider.contract.test.ts`

Expected: FAIL because the provider boundary and test server do not exist.

- [ ] **Step 3: Extract provider behavior without changing domain callers**

```ts
export interface ProviderRequestOptions {
  projectId: string
  model: string
  temperature: number
  signal?: AbortSignal
  maxRetries?: number
}

export interface AICompletionResult<T> {
  value: T
  usage: { promptTokens: number, completionTokens: number, totalTokens: number }
  latencyMs: number
}
```

Retry only 429 and retryable 5xx/network failures. Do not retry configuration errors, explicit abort, authentication failures or schema parse failures. Accept an injected `sleep(ms, signal)` in tests so retry tests do not wait real seconds. `callAIJSON` and `streamChat` delegate to this provider and retain AI usage event behavior. Preserve all pre-refactor configuration semantics, including `AI_TEMPERATURE=0`, invalid temperature fallback, existing `PORT` handling and existing caller-visible defaults; add regression assertions before extraction.

- [ ] **Step 4: Run contract and existing AI tests**

Run: `pnpm --filter @ai-novel/api test -- src/modules/ai/openai-compatible-provider.contract.test.ts src/modules/ai/ai-fake-provider.test.ts src/app.integration.test.ts`

Expected: JSON, SSE, retry, timeout, disconnect, invalid JSON and abort cases pass.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/ai apps/api/src/test/openai-compatible-test-server.ts
git commit -m "refactor(ai): isolate OpenAI compatible provider protocol"
```

### Task 4: 安全错误分类与 API 进程生命周期

**Files:**
- Create: `apps/api/src/modules/ai/ai-error-sanitizer.ts`
- Create: `apps/api/src/modules/ai/ai-error-sanitizer.test.ts`
- Modify: `apps/api/src/modules/ai/ai.service.ts`
- Modify: `apps/api/src/eventing-runtime.ts`
- Modify: `apps/api/src/index.ts`
- Create: `apps/api/src/index.test.ts`

**Interfaces:**
- Produces: `sanitizeAIError(error): { code: string, retryable: boolean, publicMessage: string }`
- Produces: `startRuntime(): Promise<() => Promise<void>>`

- [ ] **Step 1: Write failing sanitization and shutdown tests**

```ts
expect(sanitizeAIError(new Error('Bearer secret-key prompt=private text'))).toEqual({
  code: 'PROVIDER_ERROR',
  retryable: true,
  publicMessage: 'AI 服务暂时不可用',
})
```

The index lifecycle test injects a fake server and runtime, sends `SIGTERM` through the exported shutdown handler, and asserts runtime stop precedes server close and SQL close.

- [ ] **Step 2: Run the tests and verify RED**

Run: `pnpm --filter @ai-novel/api test -- src/modules/ai/ai-error-sanitizer.test.ts src/index.test.ts`

Expected: FAIL because sanitizer and testable lifecycle do not exist.

- [ ] **Step 3: Implement sanitizer and graceful runtime startup/shutdown**

Move process wiring behind exported functions; keep `index.ts` as the direct-run composition entry. Replace raw `console.warn(errorMessage(error))` with code-only diagnostics. Register `SIGINT` and `SIGTERM` once, stop OutboxRuntime, close HTTP server, then close PostgreSQL.

- [ ] **Step 4: Run the tests and verify GREEN**

Run the command from Step 2 plus `pnpm --filter @ai-novel/api test -- src/eventing/outbox-runtime.integration.test.ts`.

Expected: sanitized errors and shutdown ordering pass.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/index.ts apps/api/src/index.test.ts apps/api/src/eventing-runtime.ts apps/api/src/modules/ai
git commit -m "feat(api): shut down workflow runtime safely"
```

### Task 5: 显式真实 Provider smoke

**Files:**
- Create: `apps/api/src/scripts/smoke-ai.ts`
- Create: `apps/api/src/scripts/smoke-ai.test.ts`
- Modify: `apps/api/package.json`
- Modify: `package.json`
- Modify: `.env.example`

**Interfaces:**
- Produces: `runAISmoke(env: NodeJS.ProcessEnv): Promise<AISmokeReport>`
- Produces: root command `pnpm smoke:ai`

- [ ] **Step 1: Write failing guard tests**

```ts
await expect(runAISmoke({})).rejects.toThrow('AI_SMOKE=1')
await expect(runAISmoke({ AI_SMOKE: '1' })).rejects.toThrow('AI_SMOKE_PROJECT_ID')
```

Inject a fake provider into the success test and assert the report contains only provider, model, latency, valid response and token counts.

- [ ] **Step 2: Run the test and verify RED**

Run: `pnpm --filter @ai-novel/api test -- src/scripts/smoke-ai.test.ts`

Expected: FAIL because the smoke runner is absent.

- [ ] **Step 3: Implement guarded smoke command**

Use a fixed non-sensitive prompt, `max_tokens: 16`, project-scoped stored settings and a 30-second AbortSignal timeout. Never accept an API key CLI argument and never print configured base URL query strings or raw response content.

- [ ] **Step 4: Run the test and verify GREEN**

Run: `pnpm --filter @ai-novel/api test -- src/scripts/smoke-ai.test.ts`

Expected: guard and injected success tests pass without network access.

- [ ] **Step 5: Commit**

```bash
git add .env.example package.json apps/api/package.json apps/api/src/scripts/smoke-ai.ts apps/api/src/scripts/smoke-ai.test.ts
git commit -m "feat(ai): add opt in provider smoke check"
```

### Task 6: 可靠性文档与阶段交接

**Files:**
- Modify: `docs/architecture/overview.md`
- Modify: `docs/guides/local-development.md`
- Modify: `docs/standards/engineering.md`
- Modify: `docs/status/development-memory.md`
- Modify: `docs/status/handoff.md`

**Interfaces:**
- Produces: documented Worker lifecycle, health response and smoke procedure

- [ ] **Step 1: Record exact runtime invariants**

Document lease recovery, heartbeat stale threshold, retryable error categories, graceful shutdown order, health endpoint fields, `AI_SMOKE` guard and the rule that an unconfigured real smoke is reported as “not executed”.

- [ ] **Step 2: Run phase tests**

Run: `pnpm --filter @ai-novel/api test -- src/eventing/outbox-worker.integration.test.ts src/eventing/outbox-runtime.integration.test.ts src/modules/automation/workflow-health.service.integration.test.ts src/modules/ai/openai-compatible-provider.contract.test.ts src/modules/ai/ai-error-sanitizer.test.ts src/scripts/smoke-ai.test.ts`

Expected: all selected tests pass.

- [ ] **Step 3: Update memory and handoff**

Record completed commit hashes, migration number, health fields, tests run and the exact next plan: `2026-08-12-book-setup-backend.md`.

- [ ] **Step 4: Commit**

```bash
git add docs
git commit -m "docs(automation): record workflow runtime baseline"
```
