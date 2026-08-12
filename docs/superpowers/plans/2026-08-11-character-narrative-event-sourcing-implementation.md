# Character and Narrative Event Sourcing Implementation Plan

> **Execution rule:** Implement task-by-task with TDD. Product state changes only through commands and events. Projection tables are synchronous, replayable read models. Do not clear the database until the automation/runtime phase also completes.

**Goal:** Move characters, character arcs, relationships, conflicts, conflict timelines, foreshadowing, chapter knowledge, story facts, authoring activity, and reference knowledge onto the Eventing Kernel while preserving the current HTTP contracts.

**Aggregate boundaries:** One `Character` aggregate per character owns its profile and arc timeline. One `Relationship`, `Conflict`, and `Foreshadowing` aggregate owns each corresponding entity plus its child rows. One `ChapterKnowledge` aggregate per chapter owns chapter elements and the chapter memory. One project-scoped `NarrativeKnowledge` aggregate owns facts, knowledge sources, chunks, notes, and authoring activity. Embeddings remain rebuildable search indexes rather than domain facts.

**Projection rule:** Cross-domain projection tables must not rely on database cascades for business behavior. Projectors explicitly apply deletion and reference-cleanup events so each projection can be reset and replayed without mutating an unrelated projection.

---

## Task 1: Shared event payload codecs and projection isolation

**Files:**
- Create: `apps/api/src/eventing/payload-codecs.ts`
- Modify: existing `*.eventing.ts` modules
- Modify: narrative and chapter-related schema definitions
- Create: Drizzle migration
- Modify: eventing and architecture tests

- [x] Add tested reusable object, string, number, enum, and array payload readers with domain-specific error codes.
- [x] Replace duplicated primitive payload readers in existing evented domains without changing behavior.
- [x] Remove cross-projection cascade and set-null foreign keys that make one projector mutate another projection.
- [x] Add architecture coverage for projection reset isolation.
- [x] Commit: `refactor(api): isolate event projections and share payload codecs`.

## Task 2: Character profile and arc aggregate

**Files:**
- Create: `apps/api/src/modules/character/character.eventing.ts`
- Create: `apps/api/src/modules/character/character.commands.ts`
- Create: `apps/api/src/modules/character/character.eventing.integration.test.ts`
- Modify: character profile/arc services and routes
- Modify: `apps/api/src/eventing-runtime.ts`

- [x] Define and validate `CharacterCreated`, `CharacterChanged`, `CharacterDeleted`, `CharacterArcEventRecorded`, `CharacterArcEventCorrected`, and `CharacterArcEventRemoved`.
- [x] Enforce project, chapter, and scene ownership before producing events.
- [x] Project profiles and arc rows synchronously and rebuild one project without affecting another.
- [x] Preserve current character and arc HTTP response shapes, adding `Idempotency-Key` support to every mutation.
- [x] Commit: `feat(api): event source characters and arcs`.

## Task 3: Relationship aggregate

**Files:**
- Create: `apps/api/src/modules/character/relationship.eventing.ts`
- Create: `apps/api/src/modules/character/relationship.commands.ts`
- Create: relationship eventing tests
- Modify: relationship services and routes
- Modify: `apps/api/src/eventing-runtime.ts`

- [x] Define `RelationshipCreated`, `RelationshipChanged`, and `RelationshipDeleted`.
- [x] Normalize character pairs, reject self-links, validate ownership, and enforce one active relationship per pair.
- [x] Project and replay relationships with stable IDs and timestamps.
- [x] Preserve current HTTP conflict/not-found behavior and add command idempotency.
- [x] Commit: `feat(api): event source character relationships`.

## Task 4: Conflict aggregate and timeline

**Files:**
- Create: `apps/api/src/modules/narrative/conflict.eventing.ts`
- Create: `apps/api/src/modules/narrative/conflict.commands.ts`
- Create: conflict eventing tests
- Modify: conflict and timeline services/routes
- Modify: `apps/api/src/eventing-runtime.ts`

- [x] Define `ConflictCreated`, `ConflictChanged`, `ConflictDeleted`, `ConflictParticipantsReplaced`, `ConflictTimelineRecorded`, and `ConflictTimelineRemoved`.
- [x] Keep participant replacement atomic inside the Conflict stream.
- [x] Validate participant, chapter, and scene ownership before append.
- [x] Project and replay conflict state, participant links, and timeline rows.
- [x] Commit: `feat(api): event source conflicts and timelines`.

## Task 5: Foreshadowing aggregate

**Files:**
- Create: `apps/api/src/modules/narrative/foreshadowing.eventing.ts`
- Create: `apps/api/src/modules/narrative/foreshadowing.commands.ts`
- Create: foreshadowing eventing tests
- Modify: foreshadowing services/routes
- Modify: `apps/api/src/eventing-runtime.ts`

- [x] Define `ForeshadowingCreated`, `ForeshadowingChanged`, `ForeshadowingDeleted`, and `ForeshadowingCharactersReplaced`.
- [x] Express progression, payoff, and abandonment as validated state changes.
- [x] Validate referenced chapters and characters and atomically replace character links.
- [x] Project and replay the item and character-link read models.
- [x] Commit: `feat(api): event source foreshadowing ledger`.

## Task 6: Chapter knowledge aggregate

**Files:**
- Create: `apps/api/src/modules/story/chapter-knowledge.eventing.ts`
- Create: `apps/api/src/modules/story/chapter-knowledge.commands.ts`
- Create: chapter knowledge eventing tests
- Modify: chapter element and memory services/routes
- Modify: automation callers

- [ ] Define element add/change/remove/replace events and `ChapterMemoryRecorded`.
- [ ] Make bulk element replacement one atomic command with deterministic duplicate validation.
- [ ] Preserve character-name normalization and project ownership checks.
- [ ] Replace direct memory and element writes in change-set and postprocess paths with correlated commands.
- [ ] Commit: `feat(api): event source chapter knowledge`.

## Task 7: Narrative facts, reference knowledge, and authoring activity

**Files:**
- Create: `apps/api/src/modules/narrative/narrative-knowledge.eventing.ts`
- Create: `apps/api/src/modules/narrative/narrative-knowledge.commands.ts`
- Create: narrative knowledge eventing tests
- Modify: authoring event service/routes and knowledge callers
- Modify: seed flow

- [ ] Define fact record/change/remove, knowledge source/chunk/note, and authoring activity events.
- [ ] Keep embeddings as disposable derived indexes keyed by content hash.
- [ ] Make reference knowledge and authoring activity project-scoped and replayable.
- [ ] Replace automation fact writes with correlated NarrativeKnowledge commands.
- [ ] Commit: `feat(api): event source narrative knowledge`.

## Task 8: Remove automation narrative write bypasses

**Files:**
- Modify: `apps/api/src/modules/automation/*.service.ts`
- Modify: affected automation and HTTP tests

- [ ] Route accepted character, relationship, conflict, foreshadowing, fact, element, and memory changes through domain commands.
- [ ] Preserve correlation and causation from run, job, change-set, postprocess, and suggestion context.
- [ ] Ensure rejected, blocked, stale, or failed suggestions never mutate narrative projections.
- [ ] Verify retries cannot duplicate domain entities or timeline entries.
- [ ] Commit: `refactor(api): command all narrative automation writes`.

## Task 9: Architecture gates and phase verification

**Files:**
- Modify: `apps/api/src/architecture.test.ts`
- Modify: architecture and local-development docs

- [ ] Prevent direct writes to all migrated character and narrative projection tables outside projectors and destructive seed/reset tooling.
- [ ] Verify project-scoped replay and cross-project isolation for every new projection.
- [ ] Verify the retained HTTP lifecycle through integration tests and browser-visible cockpit projections.
- [ ] Run `pnpm db:generate`, `pnpm db:migrate`, `pnpm check`, and `pnpm test:coverage`.
- [ ] Do not run the destructive final database clear yet; automation/runtime aggregates still use legacy tables.
- [ ] Commit: `test: verify character narrative event sourcing phase`.

## Phase exit criteria

- Character, relationship, conflict, foreshadowing, chapter knowledge, fact, reference knowledge, and authoring activity state changes only through commands and events.
- Every retained SQL table in scope is a replayable projection or a disposable derived search index.
- Cross-projection database cascades cannot corrupt an unrelated replay.
- Automation cannot bypass the migrated aggregate invariants.
- Existing HTTP behavior remains compatible and mutation retries are idempotent.
- Full repository and coverage gates pass with a clean worktree.
