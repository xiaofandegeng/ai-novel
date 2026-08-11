# Story Structure and Chapter Event Sourcing Implementation Plan

> **Execution rule:** Implement task-by-task with TDD. All product writes go through commands and events. Existing tables may remain only as synchronous, replayable projections. Do not clear the database until every product domain has completed the cutover.

**Goal:** Move story bibles, volumes, acts, chapters, scenes, chapter body, and chapter versions onto the Eventing Kernel while preserving the current HTTP and web contracts.

**Architecture:** One `StoryStructure` aggregate per project owns the story bible, volumes, acts, and applied template history. One `Chapter` aggregate per chapter owns chapter metadata, outline, draft, status, and scenes. `story_bibles`, `volumes`, `acts`, `chapters`, `chapter_scenes`, and `chapter_versions` become synchronous projections. Chapter versions are derived from content-application events and cannot be written or deleted independently.

**Automation boundary:** Automation services may read projections and dispatch domain commands. They may not update chapter or scene projections directly. Long-running generation remains asynchronous, but every accepted result crosses the Chapter command boundary before it becomes product state.

---

## Task 1: Harden event validation and replay upcasting

**Files:**
- Modify: `apps/api/src/eventing/command-bus.ts`
- Modify: `apps/api/src/eventing/projection-runner.ts`
- Modify: `apps/api/src/eventing/replay.ts`
- Modify: `apps/api/src/eventing-runtime.ts`
- Modify: eventing kernel tests

- [x] Test that runtime commands reject unregistered or malformed pending events before append.
- [x] Test that synchronous, asynchronous, and replay projectors receive current-schema payloads after upcasting.
- [x] Inject the Event Registry into the command and projection paths without breaking isolated kernel tests.
- [x] Commit: `fix(api): validate and upcast events at kernel boundaries`.

## Task 2: StoryStructure aggregate and projections

**Files:**
- Create: `apps/api/src/modules/story/story-structure.eventing.ts`
- Create: `apps/api/src/modules/story/story-structure.eventing.integration.test.ts`
- Modify: `apps/api/src/eventing-runtime.ts`
- Modify: `apps/api/src/modules/story/story-bibles.service.ts`
- Modify: `apps/api/src/modules/story/volumes.service.ts`
- Modify: `apps/api/src/modules/story/acts.service.ts`
- Modify: `apps/api/src/modules/story/story-structure.service.ts`

- [x] Define strict `StoryBibleChanged`, `VolumeCreated`, `VolumeChanged`, `VolumeDeleted`, `ActCreated`, `ActChanged`, `ActDeleted`, and `StructureTemplateApplied` events.
- [x] Enforce project ownership, unique entity IDs, and aggregate invariants in command handlers.
- [x] Project events synchronously into the existing story structure tables.
- [x] Rebuild one project without changing another project's rows.
- [x] Route all story bible, volume, act, and structure-template writes through the Command Bus.
- [x] Commit: `feat(api): event source story structure`.

## Task 3: Chapter aggregate and chapter projection

**Files:**
- Create: `apps/api/src/modules/story/chapter.eventing.ts`
- Create: `apps/api/src/modules/story/chapter.eventing.integration.test.ts`
- Modify: `apps/api/src/eventing-runtime.ts`
- Modify: `apps/api/src/modules/story/chapters.service.ts`

- [x] Define `ChapterCreated`, `ChapterRenamed`, `OutlineChanged`, `ChapterDetailsChanged`, `ChapterContentApplied`, `ChapterCompleted`, and `ChapterDeleted` events.
- [x] Preserve the existing chapter response shape and validation behavior.
- [x] Validate target volume ownership from the StoryStructure aggregate/projection boundary.
- [x] Project chapter events synchronously into `chapters` and derive status transitions from aggregate state.
- [x] Commit: `feat(api): event source chapter lifecycle`.

## Task 4: Scene planning and content application

**Files:**
- Modify: `apps/api/src/modules/story/chapter.eventing.ts`
- Modify: `apps/api/src/modules/story/chapter.eventing.integration.test.ts`
- Modify: `apps/api/src/modules/story/scenes.service.ts`
- Modify: `apps/api/src/modules/story/scenes.routes.ts`

- [ ] Define scene plan/create/change/reorder/delete and `SceneContentApplied` events inside the Chapter stream.
- [ ] Make bulk append/replace one atomic chapter command.
- [ ] Keep scene ordering deterministic and reject unknown scene IDs.
- [ ] Project scenes into `chapter_scenes` and verify replay equality.
- [ ] Commit: `feat(api): event source chapter scenes`.

## Task 5: Derived chapter version history

**Files:**
- Modify: `apps/api/src/modules/story/chapter.eventing.ts`
- Modify: `apps/api/src/modules/story/version.service.ts`
- Modify: `apps/api/src/modules/story/versions.routes.ts`
- Modify: chapter eventing tests

- [ ] Derive immutable version rows from chapter content application events.
- [ ] Replace manual snapshot creation with an explicit Chapter command/event.
- [ ] Remove version deletion as a product write; retain compatibility response only if the UI still calls it, with a clear immutable-history error.
- [ ] Verify replay reproduces version content, note, word count, and ordering.
- [ ] Commit: `feat(api): derive chapter versions from events`.

## Task 6: Route and web-client cutover

**Files:**
- Modify: story routes and API integration tests
- Modify: affected `apps/web` chapter/story API modules and tests

- [ ] Add `Idempotency-Key` support to every story/chapter mutation route.
- [ ] Preserve existing success payloads, status codes, and project-boundary failures.
- [ ] Verify create/edit/delete, bulk scene planning, chapter completion, and version browsing through HTTP.
- [ ] Commit: `refactor(api): route story writes through command bus`.

## Task 7: Remove automation write bypasses

**Files:**
- Modify: `apps/api/src/modules/automation/*.service.ts`
- Modify: affected automation tests

- [ ] Replace every direct chapter/scene update with an idempotent domain command.
- [ ] Carry correlation and causation IDs from run/job context.
- [ ] Ensure postprocess side effects begin only after the accepted chapter event commits.
- [ ] Verify retries cannot apply generated content twice.
- [ ] Commit: `refactor(api): command chapter automation writes`.

## Task 8: Architecture gates and phase verification

**Files:**
- Modify: `apps/api/src/architecture.test.ts`
- Modify: `docs/architecture/overview.md`
- Modify: `docs/guides/local-development.md`

- [ ] Prevent direct writes to story/chapter projection tables outside registered projectors and seed/reset tooling.
- [ ] Verify project-scoped replay for every new projection.
- [ ] Run browser checks for story structure and chapter editing at desktop and mobile widths.
- [ ] Run `pnpm db:generate`, `pnpm db:migrate`, `pnpm check`, and `pnpm test:coverage`.
- [ ] Do not run the destructive final database clear yet; later product domains still depend on their legacy tables.
- [ ] Commit: `test: verify story chapter event sourcing phase`.

## Phase exit criteria

- Story structure, chapter, scene, body, and version product state is changed only by commands/events.
- All retained SQL tables are replayable projections and are not independent sources of truth.
- Chapter version history is immutable and derived from Chapter events.
- Automation cannot bypass aggregate invariants.
- Existing HTTP/web behavior remains compatible except version deletion, which is intentionally rejected.
- Full repository and coverage gates pass with a clean worktree.
