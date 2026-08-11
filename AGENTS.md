# AI Novel Workbench Agent Instructions

This file is the first document every AI coding agent must read before changing this repository. It is the project-level entry point for Codex, Claude, Cursor, Copilot-style agents, and other coding assistants.

## Required Reading Order

Before writing code, read these files in order:

1. `AGENTS.md`
2. `docs/README.md`
3. `docs/architecture/overview.md`
4. `docs/standards/engineering.md`
5. `docs/standards/ui.md`
6. `docs/standards/ai-collaboration.md`
7. `docs/product/product-design.md`
8. `docs/design/ui-design-spec.md`

## Project Summary

This repository is an AI-assisted long-form novel writing workbench. Its current frontend is a single automatic-writing cockpit plus project settings; story bibles, characters, relationships, conflicts, outlines, knowledge, health reports, and version history remain backend domains and cockpit context.

The product is not a generic AI chat app. It is a structured creative writing system where AI output must remain reviewable and controlled by the author.

## Tech Stack

- Monorepo: pnpm workspace
- Frontend: Vue 3, TypeScript, Pinia, Vue Router, UnoCSS
- Backend: Hono, TypeScript, Drizzle ORM, PostgreSQL
- Shared contracts: `packages/shared`
- UI package: `packages/ui`

## Repository Boundaries

Use this structure:

```text
apps/web        Frontend app organized by feature
apps/api        Backend API organized by domain module
packages/ui     Shared design-system components
packages/shared Shared types and API contracts
docs            Indexed product, design, architecture, guides, and standards
```

Do not put build artifacts, temporary scripts, generated experiments, or one-off migration helpers inside business source folders such as `apps/web/src/views`.

## Hard Rules

1. Keep the app buildable at every stage.
2. Run verification before claiming completion.
3. Do not bypass the design system.
4. AI-generated content may only be written within an explicitly started run and must pass through change-set, risk-decision, repair, or isolation handling.
5. Do not use native `alert`, `confirm`, or `prompt` in product UI.
6. Do not hardcode `http://localhost:3000` in frontend source; use `/api` and the Vite proxy.
7. Do not add database schema fields without matching migrations.
8. Do not use Drizzle callback-style `where(({ eq }) => ...)`; import `eq`, `and`, `or`, etc. from `drizzle-orm`.
9. Do not use `any` for domain models when a shared type can exist.
10. Do not delete or revert user changes unless the user explicitly asks.

## Verification Commands

Run these for normal feature work:

```bash
pnpm check
```

If `pnpm check` is not available for some reason, run:

```bash
pnpm lint
pnpm typecheck
pnpm build
pnpm test
```

For database or schema work, also run:

```bash
pnpm db:generate
pnpm db:migrate
pnpm --filter @ai-novel/api db:seed
```

For frontend UI changes, inspect the affected route in the browser and check desktop and mobile widths.

## Development Workflow

1. Inspect existing files before proposing a design.
2. Make the smallest coherent change that satisfies the task.
3. Keep business logic in the right layer:
   - Vue views compose feature components.
   - Pinia stores hold state.
   - `apps/web/src/features/*/api` owns domain HTTP calls.
   - `apps/web/src/shared/api` owns the reusable HTTP client.
   - Hono routes handle HTTP.
   - `apps/api/src/modules/*` owns routes and backend business logic by domain.
   - `packages/shared` owns cross-app contracts.
4. Add or update tests when changing shared contracts, services, composables, or critical flows.
5. Summarize changed files and verification results in the final response.

## Review Standard

When reviewing code, prioritize:

1. Build, type, and migration blockers
2. Data loss or project-boundary leaks
3. AI trust-boundary violations
4. UI design-system violations
5. Duplicated logic and architecture drift
6. Missing tests for changed behavior

Findings should include file paths and line references where possible.
