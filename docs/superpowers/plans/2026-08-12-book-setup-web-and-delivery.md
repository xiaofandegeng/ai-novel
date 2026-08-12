# 新书规划前端、端到端与最终交付 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILLS: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task; use vue-best-practices for every Vue task, playwright for browser automation, and superpowers:verification-before-completion before reporting completion. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 交付作者可选择逐阶段确认或全自动推进的新书规划工作区，接入运行时健康状态，完成两条可重复的浏览器链路，并在所有实现结束后统一完成数据库、全仓、安全和文档验收。

**Architecture:** `automation-cockpit-view.vue` 根据 BookSetup 投影切换“规划工作区/写作驾驶舱”，不新增旧式领域 CRUD 页面。前端 feature 由 API、Pinia store、composable 和小型展示组件组成；服务端状态是唯一事实源，轮询只刷新投影。Playwright 使用隔离的 `_test` 数据库和 Fake AI，覆盖 guided 与 automatic 两条真实 HTTP/Worker/UI 链路。

**Tech Stack:** Vue 3、TypeScript、Pinia、Vue Router、UnoCSS、`@ai-novel/ui`、Vitest、Vue Test Utils、Playwright

## Global Constraints

- 本计划依赖前三份实施计划完成；不得在前端伪造阶段推进结果。
- `guided` 与 `automatic` 只改变审批策略，不得维护两套页面或状态机。
- “规划完成后自动开始正文”是独立 checkbox，默认关闭。
- high 风险、结构错误、Worker 不健康或 Provider 不可用必须清晰阻塞并给出下一步。
- 组件遵循 Vue Composition API、`<script setup lang="ts">`、单向数据流和共享设计系统。
- 禁止 native `alert`/`confirm`/`prompt`，禁止硬编码 API origin。
- 自动浏览器测试只清理明确校验为 `_test` 的数据库。
- 在 Task 9 前只运行当前任务的窄测试；全仓验收只在全部实现完成后执行。
- 每个生产行为先写失败测试，观察正确失败后再实现。

---

### Task 1: BookSetup API client、Pinia Store 与 composable

**Files:**
- Create: `apps/web/src/features/book-setup/api/book-setup.api.ts`
- Create: `apps/web/src/features/book-setup/api/book-setup.api.test.ts`
- Create: `apps/web/src/features/book-setup/stores/book-setup.store.ts`
- Create: `apps/web/src/features/book-setup/stores/book-setup.store.test.ts`
- Create: `apps/web/src/features/book-setup/composables/useBookSetup.ts`
- Create: `apps/web/src/features/book-setup/composables/useBookSetup.test.ts`

**Interfaces:**
- Produces: typed methods for every approved BookSetup endpoint
- Produces: `useBookSetupStore()` as the only mutable client state owner
- Produces: `useBookSetup(projectId)` view-facing commands and computed state

- [ ] **Step 1: Write failing API/store tests**

Mock `shared/api/client.ts` and assert exact `/api/projects/:projectId/book-setup` paths, methods, bodies and response envelopes. Cover create, fetch, options, start, edit, regenerate, approve, reject, pause, resume, retry and abandon. Assert concurrent refreshes cannot let an older response overwrite a newer setup revision.

```ts
expect(client.post).toHaveBeenCalledWith(
  '/projects/project-1/book-setup',
  { mode: 'guided', startWritingAfterPlanning: false },
)
expect(store.setup?.currentRevision).toBe(2)
```

- [ ] **Step 2: Run the tests and verify RED**

Run: `pnpm --filter @ai-novel/web test -- src/features/book-setup/api/book-setup.api.test.ts src/features/book-setup/stores/book-setup.store.test.ts src/features/book-setup/composables/useBookSetup.test.ts`

Expected: FAIL because the BookSetup feature does not exist.

- [ ] **Step 3: Implement typed state and commands**

Keep HTTP serialization in the API file. The store owns `setup`, `loading`, `submittingAction`, `error`, the latest request token and refresh timer state. The composable exposes computed `isPlanning`, `isBlocked`, `canEdit`, `canApprove`, `currentCandidate`, `validationIssues`, and thin action functions.

Commands must await the server response and then refresh the projection. Do not optimistically mark a stage approved. Surface errors through typed state so the view can use `NErrorState` and toast messages.

- [ ] **Step 4: Run the tests and verify GREEN**

Run the command from Step 2.

Expected: all API, stale-response and state transition assertions pass.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/book-setup/api apps/web/src/features/book-setup/stores apps/web/src/features/book-setup/composables
git commit -m "feat(web): add book setup client state"
```

### Task 2: 入口选项、阶段导航与工作区骨架

**Files:**
- Create: `apps/web/src/features/book-setup/components/book-setup-start-panel.vue`
- Create: `apps/web/src/features/book-setup/components/book-setup-stage-nav.vue`
- Create: `apps/web/src/features/book-setup/components/book-setup-workspace.vue`
- Create: `apps/web/src/features/book-setup/components/book-setup-shell.test.ts`

**Interfaces:**
- Produces: `BookSetupStartPanel` with independent mode and writing authorization controls
- Produces: `BookSetupStageNav` with accessible stage/status navigation
- Produces: `BookSetupWorkspace` as the focused two-column planning shell

- [ ] **Step 1: Write failing component tests**

Mount the start panel and assert:

- default mode is `guided`;
- `startWritingAfterPlanning` is unchecked independently of mode;
- switching to `automatic` does not check it;
- submit emits one typed create input;
- unavailable runtime disables submit and explains why.

Mount stage navigation and assert current, completed, waiting-review, failed and locked stages use text plus icon/ARIA state rather than color alone.

- [ ] **Step 2: Run the test and verify RED**

Run: `pnpm --filter @ai-novel/web test -- src/features/book-setup/components/book-setup-shell.test.ts`

Expected: FAIL because the components are absent.

- [ ] **Step 3: Implement the approved focused layout**

Use `NPanel`, `NButton`, `NTag`, `NSelect`, `NInput`, `NLoadingState`, `NErrorState` and existing tokens. Desktop layout is a 240–280 px stage rail plus flexible editor; at widths below 768 px use a single-column full-screen stage view with a compact progress header. Keep the primary action at the end of the reading flow.

The workspace handles shell-only cases: initial loading, no setup, setup creation, terminal abandoned/completed, and a slot/component boundary for the current-stage editor. It must not execute domain commands itself.

- [ ] **Step 4: Run the test and verify GREEN**

Run the command from Step 2.

Expected: defaults, mode independence, disabled explanations and semantic navigation pass.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/book-setup/components/book-setup-start-panel.vue apps/web/src/features/book-setup/components/book-setup-stage-nav.vue apps/web/src/features/book-setup/components/book-setup-workspace.vue apps/web/src/features/book-setup/components/book-setup-shell.test.ts
git commit -m "feat(web): add focused book setup workspace"
```

### Task 3: 五阶段候选编辑、校验和审批

**Files:**
- Create: `apps/web/src/features/book-setup/components/book-setup-candidate-editor.vue`
- Create: `apps/web/src/features/book-setup/components/book-setup-idea-editor.vue`
- Create: `apps/web/src/features/book-setup/components/book-setup-world-editor.vue`
- Create: `apps/web/src/features/book-setup/components/book-setup-characters-editor.vue`
- Create: `apps/web/src/features/book-setup/components/book-setup-structure-editor.vue`
- Create: `apps/web/src/features/book-setup/components/book-setup-chapters-editor.vue`
- Create: `apps/web/src/features/book-setup/components/book-setup-validation-panel.vue`
- Create: `apps/web/src/features/book-setup/components/book-setup-stage-actions.vue`
- Create: `apps/web/src/features/book-setup/components/book-setup-editors.test.ts`

**Interfaces:**
- Produces: one discriminated candidate editor facade
- Produces: stage-specific immutable draft emitters
- Produces: validation/risk review and approve/reject/regenerate controls

- [ ] **Step 1: Write failing editor tests**

Use one fixture per stage. Verify nested characters/relationships/conflicts, volumes/acts and chapters/scenes edit without mutating props; stable local keys stay unchanged when labels change; server validation paths focus or describe the relevant input; a high-risk candidate cannot be auto-approved; stale revisions disable submission and request refresh.

```ts
expect(wrapper.emitted('update:candidate')?.[0]?.[0]).toMatchObject({
  stage: 'characters',
  value: { characters: [{ key: 'hero', name: '林岚' }] },
})
expect(propsCandidate.value.characters[0].name).toBe('旧名')
```

- [ ] **Step 2: Run the test and verify RED**

Run: `pnpm --filter @ai-novel/web test -- src/features/book-setup/components/book-setup-editors.test.ts`

Expected: FAIL because the editors are absent.

- [ ] **Step 3: Implement stage-specific controlled editors**

Use shared candidate types and explicit typed cloning/update helpers; do not use `any` or JSON stringify cloning. Preserve stable keys and show read-only IDs where relationships depend on them. Map server issues by structured `path`; keep cross-reference errors in a summary even when no single input owns them.

Stage actions emit semantic events only: `save`, `regenerate`, `approve`, `reject`. Destructive abandon/reject actions use `NConfirmDialog`. Disable duplicate submissions while a command is in flight and always show the current revision.

- [ ] **Step 4: Run the test and verify GREEN**

Run the command from Step 2.

Expected: all five stage editors, immutable updates, validation mapping and action guards pass.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/book-setup/components
git commit -m "feat(web): add book setup candidate review"
```

### Task 4: 自动推进、暂停恢复、异常与完成摘要

**Files:**
- Create: `apps/web/src/features/book-setup/components/book-setup-progress.vue`
- Create: `apps/web/src/features/book-setup/components/book-setup-interruption.vue`
- Create: `apps/web/src/features/book-setup/components/book-setup-summary.vue`
- Create: `apps/web/src/features/book-setup/components/book-setup-lifecycle.test.ts`
- Modify: `apps/web/src/features/book-setup/components/book-setup-workspace.vue`
- Modify: `apps/web/src/features/book-setup/composables/useBookSetup.ts`

**Interfaces:**
- Produces: automatic-mode live progress without client-side stage advancement
- Produces: pause/resume/retry/abandon recovery UI
- Produces: completion summary that distinguishes planning completion from writing start

- [ ] **Step 1: Write failing lifecycle tests**

Cover generating, applying, pausing, paused, failed, abandoning, abandoned and completed projections. Verify polling stops for terminal states and during component disposal, resumes after transient visibility loss, and never invokes approve automatically. Verify high risk in automatic mode renders the same review editor used by guided mode.

For completion, assert these states remain different:

- planning completed + writing authorization false → show “开始正文” manual action;
- planning completed + authorization true + run started → link to writing cockpit;
- planning completed + authorization true + launch failed → show retryable launch error without reopening planning.

- [ ] **Step 2: Run the test and verify RED**

Run: `pnpm --filter @ai-novel/web test -- src/features/book-setup/components/book-setup-lifecycle.test.ts src/features/book-setup/composables/useBookSetup.test.ts`

Expected: FAIL because lifecycle presentation and polling guards are missing.

- [ ] **Step 3: Implement projection-driven lifecycle rendering**

Poll at a bounded interval only while the setup is non-terminal and the page is visible. Use the server-provided status, last error and runtime health; never calculate the next stage locally. Provide pause/resume/retry/abandon through the composable. Render revision history read-only and keep the current approved candidate visible after stage advancement.

- [ ] **Step 4: Run the tests and verify GREEN**

Run the command from Step 2.

Expected: lifecycle state matrix, polling cleanup, review fallback and completion authorization cases pass.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/book-setup/components apps/web/src/features/book-setup/composables/useBookSetup.ts apps/web/src/features/book-setup/composables/useBookSetup.test.ts
git commit -m "feat(web): handle book setup lifecycle"
```

### Task 5: 接入驾驶舱与 Worker/Provider 健康状态

**Files:**
- Create: `apps/web/src/features/automation-cockpit/api/workflow-health.api.ts`
- Create: `apps/web/src/features/automation-cockpit/api/workflow-health.api.test.ts`
- Create: `apps/web/src/features/automation-cockpit/components/workflow-health-banner.vue`
- Create: `apps/web/src/features/automation-cockpit/components/workflow-health-banner.test.ts`
- Modify: `apps/web/src/views/automation-cockpit-view.vue`
- Modify: `apps/web/src/views/core-views.integration.test.ts`
- Modify: `apps/web/src/features/cross-feature.integration.test.ts`

**Interfaces:**
- Consumes: approved workflow health and BookSetup endpoints
- Produces: one route that displays planning until completed, then the existing cockpit
- Produces: actionable degraded/unavailable health banner

- [ ] **Step 1: Write failing integration tests**

Mount the route with mocked APIs and assert:

- missing/incomplete setup renders `BookSetupWorkspace` and not writing controls;
- completed setup renders the existing cockpit without losing chapter interactions;
- completed setup offers “查看规划”, opens the approved revisions read-only, and returns to the cockpit without changing workflow state;
- unhealthy Worker blocks setup start and run start but leaves read-only data available;
- Provider misconfiguration and stale heartbeat have distinct copy and retry actions;
- route/project changes clear the old project's setup and polling state.

- [ ] **Step 2: Run the tests and verify RED**

Run: `pnpm --filter @ai-novel/web test -- src/features/automation-cockpit/api/workflow-health.api.test.ts src/features/automation-cockpit/components/workflow-health-banner.test.ts src/views/core-views.integration.test.ts src/features/cross-feature.integration.test.ts`

Expected: FAIL because health integration and setup gating are absent.

- [ ] **Step 3: Implement route-level composition**

Load workflow health and BookSetup before cockpit data. The route composes feature components only; it does not contain HTTP or domain logic. Keep existing cockpit behavior intact after completion and add a local display-only toggle for reviewing completed planning; closing the planning workspace does not pause automatic execution. If health is degraded, show `NErrorState`/`NTag` with last heartbeat, affected capability and explicit retry; never hide existing author data.

- [ ] **Step 4: Run the tests and verify GREEN**

Run the command from Step 2.

Expected: setup/cockpit gating, health messages, route cleanup and existing interactions pass.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/automation-cockpit apps/web/src/views/automation-cockpit-view.vue apps/web/src/views/core-views.integration.test.ts apps/web/src/features/cross-feature.integration.test.ts
git commit -m "feat(web): integrate planning and workflow health"
```

### Task 6: 响应式、键盘与可访问性回归

**Files:**
- Create: `apps/web/src/features/book-setup/components/book-setup-accessibility.test.ts`
- Modify: `apps/web/src/features/book-setup/components/*.vue`
- Modify: `apps/web/src/styles/main.css`
- Modify: `docs/design/ui-design-spec.md`

**Interfaces:**
- Produces: usable 1440 px, 1024 px and 390 px layouts
- Produces: keyboard-complete form, dialog and stage navigation flow

- [ ] **Step 1: Write failing semantic and focus tests**

Assert associated labels, fieldset/legend for mode selection, live regions for generation status, focus return from dialogs, logical tab order, minimum target sizing, no color-only status, and validation summary links. Add a render assertion that the 390 px layout has one primary scroll container and no fixed two-column minimum width.

- [ ] **Step 2: Run the test and verify RED**

Run: `pnpm --filter @ai-novel/web test -- src/features/book-setup/components/book-setup-accessibility.test.ts`

Expected: FAIL on the intentionally missing semantics or responsive hooks.

- [ ] **Step 3: Fix semantics and responsive tokens**

Use design tokens and UnoCSS/shared styles, not isolated hardcoded palettes. Preserve visible focus and reduced-motion behavior. Document the new planning workspace state, responsive breakpoints and component reuse in `docs/design/ui-design-spec.md`.

- [ ] **Step 4: Run the test and verify GREEN**

Run the command from Step 2.

Expected: semantic, keyboard, focus and responsive assertions pass.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/book-setup apps/web/src/styles/main.css docs/design/ui-design-spec.md
git commit -m "fix(web): harden book setup accessibility"
```

### Task 7: 隔离 Playwright 环境与两条全链路自动化测试

**Files:**
- Modify: `pnpm-workspace.yaml`
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `apps/api/package.json`
- Create: `playwright.config.ts`
- Create: `apps/api/src/scripts/start-e2e-api.ts`
- Create: `apps/api/src/scripts/start-e2e-api.test.ts`
- Create: `apps/api/src/scripts/replay-e2e-projections.ts`
- Create: `apps/web/e2e/book-setup-guided.spec.ts`
- Create: `apps/web/e2e/book-setup-automatic.spec.ts`

**Interfaces:**
- Produces: root `pnpm test:e2e`
- Produces: guarded E2E API startup using `ai_novel_e2e_test`
- Produces: deterministic Fake AI guided and automatic browser journeys

- [ ] **Step 1: Write the failing E2E target guard test**

Extract a pure `assertE2eDatabaseTarget(url)` and prove it rejects the development database, missing database names and any name not ending `_test`; it accepts only the exact configured E2E target. Assert E2E startup sets Fake AI and local project-content/master-key fixtures before loading application modules.

- [ ] **Step 2: Run the guard test and verify RED**

Run: `pnpm --filter @ai-novel/api test -- src/scripts/start-e2e-api.test.ts`

Expected: FAIL because the guarded starter does not exist.

- [ ] **Step 3: Add Playwright and the isolated server harness**

Add `@playwright/test` to the dev catalog/root dev dependencies and `test:e2e` to the root scripts. `start-e2e-api.ts` must:

1. load E2E env before importing the app;
2. assert the exact `_test` database target using the existing database-target safety helpers;
3. connect through a maintenance database only to create the exact test database when absent, then rebuild/migrate and seed only that database;
4. start one API process with Fake AI, Outbox Worker and deterministic encryption keys;
5. exit non-zero if runtime health never becomes ready.

Configure Playwright web servers for the guarded API and Vite web app, use `/api` through the Vite proxy, force one worker because replay resets shared projections, disable server reuse in CI, collect trace/screenshot/video only on failure, and cap retries/timeouts. Add a guarded `e2e:replay` API script that refuses non-test targets, runs project/all-projection replay against the same E2E database, and contains no HTTP exposure. Install Chromium with `pnpm exec playwright install chromium` only when the machine lacks the configured browser, and document the CI equivalent.

- [ ] **Step 4: Run the guard test and verify GREEN**

Run the command from Step 2.

Expected: destructive startup is impossible against a non-test target.

- [ ] **Step 5: Write and run the guided browser journey**

The test creates a project through the UI, chooses guided mode with auto-writing unchecked, starts planning, reviews/edits/approves all five stages, verifies validation blocks one invalid edit, completes planning, confirms no autonomous run started, then manually starts writing and waits for its bounded Fake-AI chapter scope to complete. It invokes the guarded E2E replay helper, reloads the browser, and compares the visible completed setup, chapter and cockpit state before/after replay.

Run: `pnpm test:e2e -- apps/web/e2e/book-setup-guided.spec.ts`

Expected: PASS against real HTTP, Outbox Worker, encrypted Event Store and projections with Fake AI only.

- [ ] **Step 6: Write and run the automatic browser journey**

The test creates a second project, chooses automatic with auto-writing checked, observes all five low-risk stages apply without client-side approval, waits for the bounded Fake-AI writing scope to complete and verifies exactly one autonomous run. It pauses and resumes once, invokes the guarded E2E replay helper, reloads the browser, and compares visible planning/writing state before and after replay. Automatic high-risk stop/correction/resume and Worker restart recovery remain deterministic backend integration cases from the preceding plan, avoiding test-only scenario controls in the product UI.

Run: `pnpm test:e2e -- apps/web/e2e/book-setup-automatic.spec.ts`

Expected: PASS without direct database writes from the test.

- [ ] **Step 7: Commit**

```bash
git add pnpm-workspace.yaml package.json pnpm-lock.yaml apps/api/package.json playwright.config.ts apps/api/src/scripts/start-e2e-api.ts apps/api/src/scripts/start-e2e-api.test.ts apps/api/src/scripts/replay-e2e-projections.ts apps/web/e2e
git commit -m "test(e2e): cover guided and automatic book setup"
```

### Task 8: 长期文档、开发记忆与交接归档

**Files:**
- Modify: `docs/README.md`
- Modify: `docs/status/current-state.md`
- Modify: `docs/status/development-memory.md`
- Modify: `docs/status/handoff.md`
- Modify: `docs/architecture/overview.md`
- Create: `docs/architecture/event-sourcing.md`
- Modify: `docs/product/product-design.md`
- Modify: `docs/guides/local-development.md`
- Modify: `docs/standards/engineering.md`

**Interfaces:**
- Produces: one current, indexed account of the shipped architecture and workflow
- Produces: restartable handoff with commits, migrations, commands and known limits

- [ ] **Step 1: Audit documentation against the implementation**

Use `rg` to find old CRUD, plaintext event, synchronous AI and pre-BookSetup descriptions. Classify each reference as historical, current or obsolete. Do not preserve contradictory current guidance.

- [ ] **Step 2: Update durable architecture and product documentation**

Document:

- envelope encryption, key deletion semantics and replay behavior;
- heartbeat/lease recovery and workflow health contract;
- Provider boundary, local protocol tests and optional real smoke;
- BookSetup aggregate, five stages, risk gates and stable-ID applicator;
- guided/automatic equivalence and independent writing authorization;
- focused responsive workspace and lack of old CRUD pages;
- migrations `0044`–`0046`, clean-database policy and recovery procedures.

- [ ] **Step 3: Update memory and handoff**

Record the final commit sequence, exact verification evidence, database target used, whether `smoke:ai` ran, remaining external prerequisites and the next safe development entry point. Keep `current-state.md` concise; detailed implementation history belongs in memory/handoff.

- [ ] **Step 4: Validate links and stale terms**

Run: `pnpm exec markdownlint-cli2 "docs/**/*.md"` if the repository already provides it; otherwise use the existing documentation validation command and `rg` link/path checks without adding a one-off dependency.

Expected: indexed links resolve and no current document describes the removed architecture as active.

- [ ] **Step 5: Commit**

```bash
git add docs
git commit -m "docs: archive book setup delivery knowledge"
```

### Task 9: 最终数据库、全仓、安全、浏览器与可选 Provider 验收

**Files:**
- Modify only when a failing check exposes a product defect covered by the approved design

**Interfaces:**
- Verifies: source, contracts, migrations, replay, encryption, worker recovery, UI and end-to-end journeys

- [ ] **Step 1: Confirm the intended database target and clean it**

Print and inspect the configured database identity before any destructive command. It must be the approved local development target, never production. Then run:

Run: `pnpm db:generate`

Expected: no uncommitted migration is generated.

Run: `pnpm db:rebuild`

Expected: the approved local database is recreated through migrations `0001`–`0046`.

Run: `pnpm db:seed`

Expected: the seed finishes through commands/events and emits no plaintext sensitive payload.

Run: `pnpm db:replay`

Expected: active projections rebuild; cryptographically deleted projects remain absent.

Run: `pnpm db:verify-encryption`

Expected: scanner reports zero plaintext content leaks and correctly recognizes tombstoned projects.

- [ ] **Step 2: Run all static, build, test and coverage gates**

Run: `pnpm check`

Run: `pnpm test:coverage`

Expected: lint, typecheck, build, all Vitest suites and configured coverage thresholds pass with no skipped BookSetup/security tests.

- [ ] **Step 3: Run both browser journeys together**

Run: `pnpm test:e2e`

Expected: guided and automatic journeys pass from clean isolated E2E database. Retain only failure artifacts; do not commit reports or screenshots.

- [ ] **Step 4: Inspect desktop, tablet and mobile UI**

Use browser automation to inspect the affected route at 1440×900, 1024×768 and 390×844. Check overflow, sticky actions, focus, loading/error/review/completed states, and verify the existing cockpit still works after planning. Capture defects as tests before fixes.

- [ ] **Step 5: Run the optional real Provider smoke only when explicitly configured**

Check for `AI_SMOKE=1`, a valid `AI_SMOKE_PROJECT_ID` and a real provider key without printing secrets.

Run when configured: `pnpm smoke:ai`

Expected: one bounded low-token call passes protocol parsing, usage accounting and redaction. If not configured, record “not run: external credentials absent” in handoff; this does not weaken local protocol coverage.

- [ ] **Step 6: Review the complete diff and fix findings test-first**

Use `superpowers:requesting-code-review` or the repository `code-review` skill against the fixed pre-implementation commit. Prioritize build/migration blockers, data loss, project-boundary leaks, trust-boundary violations, architecture drift and missing tests. For every accepted defect, add or strengthen a failing test before the fix and rerun the relevant narrow test plus affected final gate.

- [ ] **Step 7: Record final evidence**

Update `docs/status/development-memory.md` and `docs/status/handoff.md` with command outputs, migration range, browser viewport results, optional smoke status, final commit and a clean `git status`. Do not claim completion from earlier or partial runs.

### Task 10: 删除临时执行计划并形成最终提交

**Files:**
- Delete: `docs/superpowers/plans/2026-08-12-production-hardening-book-setup-roadmap.md`
- Delete: `docs/superpowers/plans/2026-08-12-project-content-encryption.md`
- Delete: `docs/superpowers/plans/2026-08-12-workflow-runtime-and-provider.md`
- Delete: `docs/superpowers/plans/2026-08-12-book-setup-backend.md`
- Delete: `docs/superpowers/plans/2026-08-12-book-setup-web-and-delivery.md`
- Modify: `docs/status/development-memory.md`
- Modify: `docs/status/handoff.md`

**Interfaces:**
- Produces: a clean repository whose durable docs, tests and code—not temporary plans—are the source of truth

- [ ] **Step 1: Prove every plan outcome is represented durably**

Cross-check each plan task against code, tests, migrations and long-term docs. Do not delete plans while any checkbox outcome is incomplete or only described in the plan itself.

- [ ] **Step 2: Remove the five temporary plan files**

Use `apply_patch` to delete only the five explicit files above. Update memory/handoff to point to durable docs and shipped commits instead of deleted paths.

- [ ] **Step 3: Verify the final tree**

Run: `git diff --check`

Run: `git status --short`

Expected: only the intentional plan removal and final memory/handoff update are pending; no reports, secrets, generated screenshots or temporary helpers exist.

- [ ] **Step 4: Commit the cleanup**

```bash
git add docs/superpowers/plans docs/status/development-memory.md docs/status/handoff.md
git commit -m "chore: remove completed implementation plans"
```

- [ ] **Step 5: Final completion check**

Run: `git status --short`

Expected: empty output. Report the final commit range, verification matrix, database state, migration range, optional smoke status and any external operational prerequisites. Do not merge or push unless the user separately authorizes that external state change.
