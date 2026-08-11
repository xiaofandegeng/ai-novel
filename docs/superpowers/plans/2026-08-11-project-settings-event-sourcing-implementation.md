# Project and Settings Event Sourcing Implementation Plan

> **Execution rule:** Implement task-by-task with TDD. Keep every existing product route usable at each commit. Do not dual-write a legacy table and the Event Store; legacy tables may remain only as synchronous projections.

**Goal:** Move Project, project-scoped AI settings, credential references, and prompt overrides onto the Eventing Kernel without migrating chapters or automation yet.

**Architecture:** Commands load aggregates and append domain events through the shared Command Bus. Synchronous projectors maintain `novel_projects`, a new project AI settings read model, and `project_prompt_overrides`. API keys live only in an AES-GCM credential vault; events contain credential references and masked suffixes. Queries continue to read projections so current downstream foreign keys remain valid.

**Compatibility:** Project CRUD response bodies remain unchanged. AI settings become genuinely project-scoped; the web client and routes move from `/api/settings/ai` to `/api/projects/:projectId/settings/ai`. Provider presets remain global and secret-free.

---

## Task 1: Session-aware aggregate loading

**Files:**
- Modify: `apps/api/src/eventing/aggregate-repository.ts`
- Modify: `apps/api/src/eventing/aggregate-repository.test.ts`

- [x] Add a failing test proving a command handler can load an aggregate through its existing `EventStoreSession`.
- [x] Add `AggregateRepository.loadInSession()` and make `load()` delegate to it.
- [x] Verify snapshots and event decoding keep existing behavior.
- [x] Commit: `refactor(api): support session-aware aggregate loading`.

## Task 2: Project aggregate, events, commands, and projector

**Files:**
- Create: `apps/api/src/modules/project/project.eventing.ts`
- Create: `apps/api/src/modules/project/project.eventing.integration.test.ts`
- Create: `apps/api/src/eventing-runtime.ts`
- Create: `apps/api/src/db/schema/project-read-model.ts`
- Modify: `apps/api/src/db/schema/index.ts`
- Generate: `apps/api/drizzle/*`

- [x] Write failing tests for `CreateProject`, `UpdateProject`, and `DeleteProject` decisions.
- [x] Register `ProjectCreated`, `ProjectDetailsChanged`, `ProjectDeletionRequested`, and `ProjectDeleted` with strict payload validation.
- [x] Implement a pure Project aggregate and optimistic expected versions.
- [x] Register a synchronous projector for replayable `project_read_models`; maintain `novel_projects` from the same events only as a temporary foreign-key compatibility projection.
- [x] Verify replay recreates the same normalized project rows.
- [x] Commit: `feat(api): event source project lifecycle`.

## Task 3: Switch Project HTTP writes to commands

**Files:**
- Modify: `apps/api/src/modules/project/projects.service.ts`
- Modify: `apps/api/src/modules/project/projects.routes.ts`
- Modify: `apps/api/src/app.integration.test.ts`

- [x] Add failing HTTP tests for Event Store writes and `Idempotency-Key` retries.
- [x] Keep list/detail queries on the project projection.
- [x] Route create/update/delete through Command Bus; preserve current status codes and response payloads.
- [x] Map missing/deleted projects to the current 404 contract and validation errors to 400.
- [x] Commit: `refactor(api): route project writes through command bus`.

## Task 4: Encrypted project credential vault

**Files:**
- Create: `apps/api/src/db/schema/credentials.ts`
- Create: `apps/api/src/security/credential-vault.ts`
- Create: `apps/api/src/security/credential-vault.integration.test.ts`
- Modify: `apps/api/src/db/schema/index.ts`
- Modify: `apps/api/src/config/environment.ts`
- Modify: `.env.example`
- Generate: `apps/api/drizzle/*`

- [x] Add failing encryption, decryption, replacement, deletion, and wrong-key tests.
- [x] Require `AI_CREDENTIAL_MASTER_KEY` for persisted credentials and accept a 32-byte base64 key.
- [x] Store AES-256-GCM ciphertext, IV, auth tag, masked suffix, and key version; never return ciphertext from settings APIs.
- [x] Add a project ownership index and cascade cleanup through explicit service logic.
- [x] Commit: `feat(api): add encrypted project credential vault`.

## Task 5: Project-scoped AI settings aggregate and projection

**Files:**
- Create: `apps/api/src/db/schema/project-settings.ts`
- Create: `apps/api/src/modules/ai/project-settings.eventing.ts`
- Create: `apps/api/src/modules/ai/project-settings.eventing.integration.test.ts`
- Modify: `apps/api/src/eventing-runtime.ts`
- Modify: `apps/api/src/modules/ai/ai.service.ts`
- Modify: `apps/api/src/modules/ai/settings.routes.ts`

- [x] Test `ProjectSettingsChanged`, `AIProviderSelected`, and `CredentialReferenceChanged` decisions.
- [x] Persist new secrets before dispatch, then emit only credential refs/suffixes; compensate unused new credentials on command failure.
- [x] Project settings into a secret-free project read model.
- [x] Resolve effective settings by `projectId`, decrypting credentials only at the AI client boundary.
- [x] Move settings get/update/test routes under `/api/projects/:projectId/settings/ai`.
- [x] Commit: `feat(api): event source project ai settings`.

## Task 6: Propagate project settings through AI execution

**Files:**
- Modify: `apps/api/src/modules/ai/*.service.ts`
- Modify: `apps/api/src/modules/automation/*.service.ts`
- Modify: affected unit and integration tests

- [x] Inventory every `getEffectiveAISettings`, `assertAIConfigured`, `callAIJSON`, `streamChat`, and `callAIEmbedding` call.
- [x] Require or propagate `projectId` at every product AI call boundary.
- [x] Reject missing project scope instead of silently using another project's credentials.
- [x] Verify cross-project credential isolation.
- [x] Commit: `refactor(api): scope ai execution to project settings`.

## Task 7: Event-source prompt overrides

**Files:**
- Modify: `apps/api/src/modules/ai/prompt-template.service.ts`
- Create: `apps/api/src/modules/ai/prompt-settings.eventing.ts`
- Create: `apps/api/src/modules/ai/prompt-settings.eventing.integration.test.ts`
- Modify: `apps/api/src/modules/ai/prompt-templates.routes.ts`
- Modify: `apps/api/src/eventing-runtime.ts`

- [x] Test `PromptTemplateSelected` / prompt override events and project ownership.
- [x] Route override upserts through Command Bus while retaining `project_prompt_overrides` as projection.
- [x] Keep global prompt template catalog and prompt run audit records outside the ProjectSettings aggregate.
- [x] Verify project-scoped replay preserves other projects.
- [x] Commit: `feat(api): event source project prompt overrides`.

## Task 8: Web client cutover and phase verification

**Files:**
- Modify: `apps/web/src/features/settings/api/settings.api.ts`
- Modify: `apps/web/src/features/settings/composables/useAIProviderSettings.ts`
- Modify: affected web tests
- Modify: `apps/api/src/architecture.test.ts`
- Modify: `docs/architecture/overview.md`
- Modify: `docs/guides/local-development.md`

- [x] Use the route project ID for every settings request.
- [x] Add architecture gates preventing direct Project and ProjectSettings projection writes outside their projectors.
- [x] Run desktop and mobile settings-route browser checks.
- [x] Run `pnpm db:generate`, `pnpm db:migrate`, `pnpm check`, and `pnpm test:coverage`.
- [x] Do not run the destructive final seed/cutover yet; chapters and remaining domains still depend on legacy projections.
- [x] Commit: `test: verify project settings event sourcing phase`.

## Phase exit criteria

- Project CRUD and project settings write only through commands/events.
- `novel_projects`, project AI settings, and prompt overrides are replayable projections.
- No plaintext API key exists in events, command receipts, logs, or settings projections.
- Existing project CRUD behavior remains compatible.
- AI requests cannot read credentials belonging to another project.
- The repository and coverage gates pass with a clean worktree.
