# 新书规划后端 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立可恢复、可审查、可全自动推进的五阶段 BookSetup 事件溯源流程，并将批准结果原子应用到现有领域聚合。

**Architecture:** `BookSetup` 聚合只拥有流程、阶段修订、验证、风险、审批和授权；Process Manager 只发命令；AI Executor 通过 Outbox 生成严格结构化候选；Stage Applicator 使用稳定 ID 和现有领域 Command 原子应用。读模型、查询与 HTTP 位于 automation 领域，最终写作启动复用现有 AutonomousRun 服务。

**Tech Stack:** TypeScript、Hono、Drizzle ORM、PostgreSQL、Event Store、Outbox、Vitest

## Global Constraints

- 本计划依赖内容加密和 Worker/Provider 两份计划完成。
- guided 与 automatic 必须共享同一 Aggregate、Event、Projector 和 Applicator。
- automatic 遇到 `high` 风险或任何结构校验错误时进入 `waiting_review`。
- `startWritingAfterPlanning` 默认 `false`，不能从 mode 推断。
- 全部 AI 候选事件标记为 `project-content`，Outbox 只携带引用 ID。
- 阶段应用不得直接写业务投影，并必须跨聚合原子回滚。
- 每个生产行为先写失败测试，观察正确失败后再实现。

---

### Task 1: 共享契约、规划投影 schema 与 migration

**Files:**
- Create: `packages/shared/src/types/book-setup.ts`
- Modify: `packages/shared/src/types/index.ts`
- Modify: `packages/shared/src/index.test.ts`
- Create: `apps/api/src/db/schema/book-setup.ts`
- Modify: `apps/api/src/db/schema/index.ts`
- Create: `apps/api/drizzle/0046_*.sql` via Drizzle
- Modify: `apps/api/drizzle/meta/_journal.json` via Drizzle
- Create: `apps/api/drizzle/meta/0046_snapshot.json` via Drizzle

**Interfaces:**
- Produces: all `BookSetup*` shared types
- Produces: `bookSetups` and `bookSetupStageRevisions` Drizzle tables

- [ ] **Step 1: Write the failing shared contract test**

```ts
const setup: BookSetup = {
  id: 'setup-1',
  projectId: 'project-1',
  mode: 'guided',
  status: 'waiting_review',
  currentStage: 'world',
  startWritingAfterPlanning: false,
  currentRevision: 1,
  createdAt: now,
  updatedAt: now,
  completedAt: null,
  lastErrorCode: null,
}
expect(setup.currentStage).toBe('world')
```

- [ ] **Step 2: Run the test and verify RED**

Run: `pnpm --filter @ai-novel/shared test -- src/index.test.ts`

Expected: FAIL because BookSetup contracts are absent.

- [ ] **Step 3: Define explicit discriminated candidate contracts**

```ts
export type BookSetupMode = 'guided' | 'automatic'
export type BookSetupStage = 'idea' | 'world' | 'characters' | 'structure' | 'chapters'
export type BookSetupStatus = 'draft' | 'running' | 'generating_stage' | 'waiting_review' | 'applying_stage' | 'pausing' | 'paused' | 'failed' | 'abandoning' | 'abandoned' | 'completed'
export type BookSetupRiskLevel = 'low' | 'medium' | 'high'

export type BookSetupCandidate
  = { stage: 'idea', value: BookSetupIdeaCandidate }
    | { stage: 'world', value: BookSetupWorldCandidate }
    | { stage: 'characters', value: BookSetupCharactersCandidate }
    | { stage: 'structure', value: BookSetupStructureCandidate }
    | { stage: 'chapters', value: BookSetupChaptersCandidate }
```

Define concrete fields: idea has title/premise/theme/genre/tone/targetAudience/targetWords; world has worldview/rules/locations/factions/timeline/facts; characters has characters/relationships/conflicts keyed by stable local keys; structure has volumes/acts/conflicts/foreshadowing; chapters has chapterNumber/title/outline/volumeKey/targetWords/scenes.

Create `book_setups` with unique `project_id`, and `book_setup_stage_revisions` with composite primary key `(setup_id, stage, revision)`. JSON columns use the shared candidate and validation types, never `any`.

Run: `pnpm db:generate`

Expected: migration `0046_*` contains both tables, foreign keys to the compatible project projection, and indexes on project/status and setup/stage.

- [ ] **Step 4: Run shared tests and typecheck**

Run: `pnpm --filter @ai-novel/shared test -- src/index.test.ts`

Run: `pnpm --filter @ai-novel/shared typecheck`

Expected: both commands pass.

- [ ] **Step 5: Commit**

```bash
git add packages/shared apps/api/src/db/schema apps/api/drizzle
git commit -m "feat(book-setup): add shared contracts and projections"
```

### Task 2: BookSetup Aggregate、Event Registry 与 Projector

**Files:**
- Create: `apps/api/src/modules/automation/book-setup.aggregate.ts`
- Create: `apps/api/src/modules/automation/book-setup.events.ts`
- Create: `apps/api/src/modules/automation/book-setup.projector.ts`
- Create: `apps/api/src/modules/automation/book-setup.eventing.ts`
- Create: `apps/api/src/modules/automation/book-setup.eventing.integration.test.ts`
- Modify: `apps/api/src/eventing-runtime.ts`

**Interfaces:**
- Produces: `bookSetupAggregate: AggregateDefinition<BookSetupState>`
- Produces: `registerBookSetupEventing(runtime): void`
- Produces: command/event constants from the approved design
- Produces: projection name `book-setups`

- [ ] **Step 1: Write failing aggregate lifecycle tests**

Test these independent behaviors: create defaults to `draft` and writing authorization false; start requests `idea`; guided candidate waits; automatic low candidate requests apply; automatic high candidate waits; pause/abandon terminal rules; stale revision submission produces `SetupStageLateResultDiscarded`. Also prove that editing an already-applied stage before planning completion creates a new revision, supersedes that stage and every downstream decision, and returns `currentStage` to the edited stage without deleting historical revisions. A completed setup is read-only; starting a new revision after writing begins requires a future explicitly designed workflow.

```ts
expect(evolve(initialBookSetupState(), createdEvent)).toMatchObject({
  mode: 'guided',
  status: 'draft',
  currentStage: 'idea',
  startWritingAfterPlanning: false,
})
```

- [ ] **Step 2: Run the test and verify RED**

Run: `pnpm --filter @ai-novel/api test -- src/modules/automation/book-setup.eventing.integration.test.ts`

Expected: FAIL because aggregate/events/projector are absent.

- [ ] **Step 3: Implement pure state transitions and event validation**

Keep `book-setup.eventing.ts` as a small composition root. `book-setup.aggregate.ts` contains initial state/evolve/guards only. `book-setup.events.ts` contains constants, payload codecs, schemaVersion and `payloadProtection`. `book-setup.projector.ts` is the only writer for the two setup projections and handles `ProjectDeleted` cleanup.

Use events from the design plus `SetupStageLateResultDiscarded` and `SetupDownstreamStagesInvalidated` so stale results and dependency invalidation are auditable without mutating old revisions.

- [ ] **Step 4: Run the integration test and verify GREEN**

Run: `pnpm --filter @ai-novel/api test -- src/modules/automation/book-setup.eventing.integration.test.ts`

Expected: lifecycle, projection and payload registration tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/automation/book-setup.* apps/api/src/eventing-runtime.ts
git commit -m "feat(book-setup): add event sourced planning aggregate"
```

### Task 3: Command wrappers、Query Service 与 HTTP surface

**Files:**
- Create: `apps/api/src/modules/automation/book-setup.commands.ts`
- Create: `apps/api/src/modules/automation/book-setup.queries.ts`
- Create: `apps/api/src/modules/automation/book-setup.service.ts`
- Create: `apps/api/src/modules/automation/book-setup.routes.ts`
- Create: `apps/api/src/modules/automation/book-setup.routes.integration.test.ts`
- Modify: `apps/api/src/modules/index.ts`
- Modify: `apps/api/src/app.integration.test.ts`

**Interfaces:**
- Produces: `dispatchBookSetupCommand<TResult>(commandType, projectId, setupId, payload, options)`
- Produces: `getBookSetup(projectId): Promise<BookSetupDetail | null>`
- Produces: all approved `/api/projects/:projectId/book-setup` routes

- [ ] **Step 1: Write failing HTTP and project-scope tests**

```ts
const created = await request('/api/projects/project-a/book-setup', { method: 'POST', body: { mode: 'guided' } })
expect(created.status).toBe(201)
expect(created.data.startWritingAfterPlanning).toBe(false)

const crossProject = await request('/api/projects/project-b/book-setup/stages/idea/approve', { method: 'POST' })
expect(crossProject.status).toBe(404)
```

Cover create, get, options, start, candidate edit, regenerate, approve, reject, pause, resume, retry and abandon.

- [ ] **Step 2: Run the test and verify RED**

Run: `pnpm --filter @ai-novel/api test -- src/modules/automation/book-setup.routes.integration.test.ts src/app.integration.test.ts`

Expected: FAIL with missing routes.

- [ ] **Step 3: Implement protocol-only routes and projection queries**

Routes parse params/body, call one service function, map `DomainCommandError` to status, and return the existing success/fail envelope. Query joins current setup with ordered current and historical revisions using both `projectId` and `setupId` filters.

- [ ] **Step 4: Run the test and verify GREEN**

Run the command from Step 2.

Expected: all BookSetup HTTP cases and existing app integration tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/automation/book-setup.commands.ts apps/api/src/modules/automation/book-setup.queries.ts apps/api/src/modules/automation/book-setup.service.ts apps/api/src/modules/automation/book-setup.routes.ts apps/api/src/modules/automation/book-setup.routes.integration.test.ts apps/api/src/modules/index.ts apps/api/src/app.integration.test.ts
git commit -m "feat(book-setup): expose planning command API"
```

### Task 4: 阶段 Prompt、严格解析、验证与 Fake AI

**Files:**
- Create: `apps/api/src/modules/automation/book-setup.prompts.ts`
- Create: `apps/api/src/modules/automation/book-setup.parser.ts`
- Create: `apps/api/src/modules/automation/book-setup.validation.ts`
- Create: `apps/api/src/modules/automation/book-setup.parser.test.ts`
- Create: `apps/api/src/modules/automation/book-setup.validation.test.ts`
- Modify: `apps/api/src/modules/ai/ai-fake-provider.ts`
- Modify: `apps/api/src/modules/ai/ai-fake-provider.test.ts`

**Interfaces:**
- Produces: `parseBookSetupCandidate(stage, value): BookSetupCandidate`
- Produces: `validateBookSetupCandidate(candidate, approvedContext): BookSetupValidationResult`
- Produces: `buildBookSetupMessages(stage, input): ChatCompletionMessageParam[]`

- [ ] **Step 1: Write failing parser and semantic validation tests**

Cover unknown fields, missing required fields, duplicate local keys, invalid relationship references, invalid volume references, non-contiguous chapter numbers, invalid scene order, target words outside 100–20,000, and a valid five-stage fixture.

```ts
expect(() => parseBookSetupCandidate('characters', {
  characters: [{ key: 'hero', name: '林岚' }],
  relationships: [{ sourceKey: 'hero', targetKey: 'missing', type: '盟友' }],
  conflicts: [],
})).toThrow('targetKey')
```

- [ ] **Step 2: Run the tests and verify RED**

Run: `pnpm --filter @ai-novel/api test -- src/modules/automation/book-setup.parser.test.ts src/modules/automation/book-setup.validation.test.ts src/modules/ai/ai-fake-provider.test.ts`

Expected: FAIL because parsers and setup fake payloads do not exist.

- [ ] **Step 3: Implement strict stage-specific codecs and deterministic fixtures**

The parser rejects unknown top-level and nested keys. Validation returns typed issues `{ code, path, severity, message }`; it never repairs silently. Add fake tasks `book_setup_idea`, `book_setup_world`, `book_setup_characters`, `book_setup_structure`, and `book_setup_chapters`, all mutually consistent around the existing 雾港 fixture. Provide injectable deterministic Fake fixtures for low-risk completion and high-risk/validation-stop integration cases; selecting a fixture is test-runtime configuration, never a production HTTP field or title convention.

- [ ] **Step 4: Run the tests and verify GREEN**

Run the command from Step 2.

Expected: invalid structures fail with stable codes and the five-stage fixture passes.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/automation/book-setup.prompts.ts apps/api/src/modules/automation/book-setup.parser.ts apps/api/src/modules/automation/book-setup.validation.ts apps/api/src/modules/automation/book-setup.parser.test.ts apps/api/src/modules/automation/book-setup.validation.test.ts apps/api/src/modules/ai/ai-fake-provider.ts apps/api/src/modules/ai/ai-fake-provider.test.ts
git commit -m "feat(book-setup): validate structured planning candidates"
```

### Task 5: AI Executor、Outbox 与 Process Manager

**Files:**
- Create: `apps/api/src/modules/automation/book-setup.executor.ts`
- Create: `apps/api/src/modules/automation/book-setup.process-manager.ts`
- Create: `apps/api/src/modules/automation/book-setup.process-manager.test.ts`
- Create: `apps/api/src/modules/automation/book-setup.executor.integration.test.ts`
- Modify: `apps/api/src/modules/automation/book-setup.events.ts`
- Modify: `apps/api/src/eventing-runtime.ts`

**Interfaces:**
- Produces: outbox handlers `book-setup.advance` and `book-setup.generate-stage`
- Produces: `advanceBookSetup(projectId, setupId): Promise<void>`
- Produces: `executeBookSetupStage(projectId, setupId, stage, revision): Promise<void>`

- [ ] **Step 1: Write failing guided/automatic process tests**

Guided assertion: start → generation requested → candidate generated → `waiting_review`, no Apply command. Automatic low assertion: same flow → approved → apply requested. Automatic high assertion: `waiting_review`, no Apply. Executor must discard a response submitted after revision changes.

- [ ] **Step 2: Run the tests and verify RED**

Run: `pnpm --filter @ai-novel/api test -- src/modules/automation/book-setup.process-manager.test.ts src/modules/automation/book-setup.executor.integration.test.ts`

Expected: FAIL because executor and process manager are absent.

- [ ] **Step 3: Implement command-only advancement and reference-only Outbox**

Outbox payload shape is exactly:

```ts
interface BookSetupOutboxReference extends JsonObject {
  projectId: string
  setupId: string
  stage: BookSetupStage
  revision: number
  externalRequestId: string
}
```

Executor reloads the current projection before and after AI, builds context from approved projections, parses/validates, and submits `SubmitSetupStageCandidate`. Process Manager reads setup projection and submits exactly one next command. Neither writes projections.

- [ ] **Step 4: Run the tests and verify GREEN**

Run the command from Step 2.

Expected: guided/automatic branching and stale-result discard pass.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/automation/book-setup.executor.ts apps/api/src/modules/automation/book-setup.process-manager.ts apps/api/src/modules/automation/book-setup.process-manager.test.ts apps/api/src/modules/automation/book-setup.executor.integration.test.ts apps/api/src/modules/automation/book-setup.events.ts apps/api/src/eventing-runtime.ts
git commit -m "feat(book-setup): orchestrate planning through outbox"
```

### Task 6: 稳定 ID 与创意/世界观原子应用

**Files:**
- Create: `apps/api/src/modules/automation/book-setup.ids.ts`
- Create: `apps/api/src/modules/automation/book-setup.ids.test.ts`
- Create: `apps/api/src/modules/automation/book-setup.applicator.ts`
- Create: `apps/api/src/modules/automation/book-setup.applicator.integration.test.ts`

**Interfaces:**
- Produces: `stableSetupEntityId(setupId, stage, localKey): string`
- Produces: `applyBookSetupStage(projectId, setupId, stage, revision): Promise<void>`

- [ ] **Step 1: Write failing stable-ID and idea/world application tests**

```ts
expect(stableSetupEntityId('setup-1', 'characters', 'hero'))
  .toBe(stableSetupEntityId('setup-1', 'characters', 'hero'))
expect(stableSetupEntityId('setup-1', 'characters', 'hero'))
  .not.toBe(stableSetupEntityId('setup-2', 'characters', 'hero'))
```

The integration test approves idea/world revisions, applies them twice, asserts one Project update, one StoryBible, expected facts, no duplicate events, and full rollback when one fact is invalid. Then apply a second approved revision and assert create/update/delete deltas are computed only against entities previously owned by this setup; omission never deletes unrelated pre-existing project data.

- [ ] **Step 2: Run the tests and verify RED**

Run: `pnpm --filter @ai-novel/api test -- src/modules/automation/book-setup.ids.test.ts src/modules/automation/book-setup.applicator.integration.test.ts`

Expected: FAIL because IDs and applicator are absent.

- [ ] **Step 3: Implement deterministic atomic application**

Generate lowercase SHA-256 IDs prefixed by entity kind. Use `commandBus.runAtomically`; dispatch `UpdateProject`, `Create/ChangeStoryBible`, and fact create/change/delete Commands with command IDs `BookSetup:<setupId>:<stage>:<revision>:<operation>:<itemKey>`. Append `SetupStageApplied` in the same active session. Compute an explicit delta from the previous applied setup revision, and detect current aggregate state through project-scoped aggregate/query access, never direct writes. Delete only deterministic setup-owned IDs and classify every deletion as high risk before application.

- [ ] **Step 4: Run the tests and verify GREEN**

Run the command from Step 2.

Expected: idempotence and atomic rollback pass.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/automation/book-setup.ids.ts apps/api/src/modules/automation/book-setup.ids.test.ts apps/api/src/modules/automation/book-setup.applicator.ts apps/api/src/modules/automation/book-setup.applicator.integration.test.ts
git commit -m "feat(book-setup): apply idea and world stages atomically"
```

### Task 7: 人物、关系与冲突应用

**Files:**
- Modify: `apps/api/src/modules/automation/book-setup.applicator.ts`
- Modify: `apps/api/src/modules/automation/book-setup.applicator.integration.test.ts`

**Interfaces:**
- Consumes: stable local-key ID mapping
- Produces: atomic `characters` stage application

- [ ] **Step 1: Add a failing characters-stage test**

Use two characters, one relationship and one conflict. Assert `CharacterCreated`, `RelationshipCreated`, `ConflictCreated` and conflict participants reference the deterministic character IDs. Add a failing relationship target and assert no entity projection survives. Apply a second approved revision that renames one character, changes the relationship and removes one setup-owned conflict; assert update/delete commands run in dependency-safe order, require high-risk approval, and leave unrelated characters untouched.

- [ ] **Step 2: Run the targeted test and verify RED**

Run: `pnpm --filter @ai-novel/api test -- src/modules/automation/book-setup.applicator.integration.test.ts -t "characters stage"`

Expected: FAIL because characters application is unsupported.

- [ ] **Step 3: Implement characters-stage command mapping**

Dispatch existing Character, Relationship and Conflict commands in dependency order inside the same active session. Resolve participant local keys before dispatch. Apply deletes in reverse dependency order and creates in forward dependency order. Generated deletion deltas are classified high risk and require an author-approved revision; omissions become explicit deltas only for deterministic setup-owned IDs, never unrelated entities.

- [ ] **Step 4: Run the full applicator test**

Run: `pnpm --filter @ai-novel/api test -- src/modules/automation/book-setup.applicator.integration.test.ts`

Expected: idea, world and characters cases pass.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/automation/book-setup.applicator.ts apps/api/src/modules/automation/book-setup.applicator.integration.test.ts
git commit -m "feat(book-setup): apply character graph stage"
```

### Task 8: 结构、章节和场景应用

**Files:**
- Modify: `apps/api/src/modules/automation/book-setup.applicator.ts`
- Modify: `apps/api/src/modules/automation/book-setup.applicator.integration.test.ts`

**Interfaces:**
- Produces: atomic `structure` and `chapters` stage application

- [ ] **Step 1: Add failing structure/chapters tests**

Apply one volume, three acts, one conflict update, one foreshadowing item, three chapters and two scenes per chapter. Assert volume/act/chapter/scene references, contiguous order, target words, and idempotent re-application. Inject an invalid volume key and assert the whole stage rolls back. Apply a revised plan with reorder/update/delete deltas and prove dependent scenes/chapters/acts are removed before parents, all deletions were explicitly approved as high risk, and unrelated structures survive.

- [ ] **Step 2: Run the targeted tests and verify RED**

Run: `pnpm --filter @ai-novel/api test -- src/modules/automation/book-setup.applicator.integration.test.ts -t "structure|chapters"`

Expected: FAIL because structure and chapter mapping are unsupported.

- [ ] **Step 3: Implement existing-domain command mapping**

Dispatch StoryStructure commands for volumes/acts, Conflict/Foreshadowing commands for narrative structure, Chapter `CreateChapter` for plans, then Chapter `PlanScenes` for scene arrays. Stable IDs derive from local keys; command IDs include revision and item key. No direct projection writes.

- [ ] **Step 4: Run the full applicator test**

Run: `pnpm --filter @ai-novel/api test -- src/modules/automation/book-setup.applicator.integration.test.ts`

Expected: all five stage mappings pass with rollback/idempotence.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/automation/book-setup.applicator.ts apps/api/src/modules/automation/book-setup.applicator.integration.test.ts
git commit -m "feat(book-setup): apply structure and chapter plans"
```

### Task 9: 暂停、恢复、失败重试、终止与正文启动

**Files:**
- Modify: `apps/api/src/modules/automation/book-setup.aggregate.ts`
- Modify: `apps/api/src/modules/automation/book-setup.events.ts`
- Modify: `apps/api/src/modules/automation/book-setup.process-manager.ts`
- Modify: `apps/api/src/modules/automation/book-setup.service.ts`
- Create: `apps/api/src/modules/automation/book-setup.lifecycle.integration.test.ts`

**Interfaces:**
- Produces: complete lifecycle recovery semantics
- Consumes: existing `createAutonomousRun` and `startAutonomousRun`

- [ ] **Step 1: Write failing lifecycle race tests**

Cover pause during AI, abandon during AI, retry after provider failure, retry after apply failure, revising an applied earlier stage with downstream invalidation, rejection of revisions after completion, and completion with writing authorization off/on. For authorization on, assert exactly one AutonomousRun is prepared and started using the chapter count and target words from the approved plan.

- [ ] **Step 2: Run the test and verify RED**

Run: `pnpm --filter @ai-novel/api test -- src/modules/automation/book-setup.lifecycle.integration.test.ts`

Expected: FAIL until lifecycle races and launch are implemented.

- [ ] **Step 3: Implement explicit authorization-version checks**

Capture setup aggregate version in each AI/apply request. Results whose stage, revision, status or authorization version changed produce `SetupStageLateResultDiscarded`. `BookSetupCompleted` occurs only after `chapters` applied. `LaunchWritingFromSetup` calls existing run creation/start with deterministic correlation/command IDs; launch failure records a setup event but leaves setup completed and retryable.

- [ ] **Step 4: Run lifecycle, process and applicator tests**

Run: `pnpm --filter @ai-novel/api test -- src/modules/automation/book-setup.lifecycle.integration.test.ts src/modules/automation/book-setup.process-manager.test.ts src/modules/automation/book-setup.applicator.integration.test.ts`

Expected: all lifecycle paths pass.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/automation/book-setup.aggregate.ts apps/api/src/modules/automation/book-setup.events.ts apps/api/src/modules/automation/book-setup.process-manager.ts apps/api/src/modules/automation/book-setup.service.ts apps/api/src/modules/automation/book-setup.lifecycle.integration.test.ts
git commit -m "feat(book-setup): complete recoverable planning lifecycle"
```

### Task 10: 后端全链、Replay、架构门禁与交接

**Files:**
- Create: `apps/api/src/modules/automation/book-setup.e2e.integration.test.ts`
- Modify: `apps/api/src/eventing/replay.integration.test.ts`
- Modify: `apps/api/src/architecture.test.ts`
- Modify: `apps/api/src/scripts/seed.ts`
- Modify: `apps/api/src/scripts/seed.integration.test.ts`
- Modify: `docs/status/development-memory.md`
- Modify: `docs/status/handoff.md`

**Interfaces:**
- Produces: backend guided and automatic deterministic full-chain evidence

- [ ] **Step 1: Write failing full-chain tests**

Guided chain explicitly approves each stage. Automatic chain uses low-risk fake outputs and writing authorization on. Save normalized setup, Project, StoryBible, Characters, Relationships, Conflicts, Foreshadowing, Structure and Chapters summaries; reset/replay every projection and compare exact summaries. Add focused scenarios where automatic receives an injected high-risk fixture, waits for author correction/approval and resumes, and where a runtime stops after claiming a BookSetup Outbox item, a new runtime recovers the expired lease and completes it exactly once.

- [ ] **Step 2: Run the test and verify RED**

Run: `pnpm --filter @ai-novel/api test -- src/modules/automation/book-setup.e2e.integration.test.ts`

Expected: FAIL on any missing registration, transition, projection or replay rule.

- [ ] **Step 3: Close registration and architecture gaps only**

Extend architecture tests so BookSetup routes are protocol-only, Process Manager is command-only, Outbox payload contains references only, and only `book-setup.projector.ts` writes setup projections. Refactor the development seed to create its sample through BookSetup commands and deterministic Fake candidate submission/application, so the seeded project has a completed setup and opens the writing cockpit without direct projection writes. Extend the seed test to assert the setup and domain summaries survive replay. Fix only gaps exposed by these assertions.

- [ ] **Step 4: Run backend BookSetup phase tests**

Run: `pnpm --filter @ai-novel/api test -- src/modules/automation/book-setup*.test.ts src/modules/automation/book-setup*.integration.test.ts src/architecture.test.ts src/eventing/replay.integration.test.ts`

Expected: guided, automatic, lifecycle, atomic application, scope and replay cases pass.

- [ ] **Step 5: Update memory/handoff and commit**

Record exact tests, migrations, aggregate/events/projection names and next plan `2026-08-12-book-setup-web-and-delivery.md`.

```bash
git add apps/api/src/modules/automation apps/api/src/eventing/replay.integration.test.ts apps/api/src/architecture.test.ts apps/api/src/scripts/seed.ts apps/api/src/scripts/seed.integration.test.ts docs/status
git commit -m "test(book-setup): verify backend planning workflow"
```
