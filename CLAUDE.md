# my-planner

A personal, single-user planner web app (no accounts/auth) — categories, todos with priority/tags/due dates/recurrence, a rich-text scratchpad for capturing and promoting quick notes into todos, and a date-agenda dashboard with search. Dark, glassmorphism-style UI.

pnpm workspace with two packages:

- `packages/backend` — Express + Mongoose (MongoDB)
- `packages/frontend` — React + Vite

## Commands

- `pnpm db:up` / `pnpm db:down` — start/stop MongoDB (docker compose)
- `pnpm dev` — run backend + frontend together
- `pnpm test` — typecheck both packages (`pnpm typecheck`), then run all tests (Vitest)
- `pnpm typecheck` — typecheck both packages (`tsc --noEmit`) without running tests

## Manual/browser verification

The dev database holds the user's real personal todos, spread across real profiles (Work, Personal, ...). When verifying a feature by driving the actual running app (e.g. via the chrome-devtools MCP), never create, edit, link, complete, or delete anything in a real profile:

- Use a profile named `Test` for all verification (create it first if it doesn't already exist), and switch into it before doing anything.
- Everything created for a manual test — categories, todos, scratch notes — should happen inside the `Test` profile. Since the whole profile is disposable and isolated, a separate `Test` category within it isn't needed for most tests; just use whatever category (including that profile's own Uncategorized) makes the scenario easiest to drive.
- Never switch into or mutate a real profile — no linking real todos, no editing a real todo/note's fields, no toggling complete, no deleting or renaming a real profile/category/todo. Read-only viewing (e.g. confirming a real profile still lists correctly after a change) is fine.
- No need to clean up after yourself inside the `Test` profile — leave whatever you created there. The user will clear it out manually at some point.
- If a scenario genuinely requires touching real data (e.g. reproducing a bug that only shows up on a specific real todo), stop and confirm with the user first rather than assuming it's fine.

## Agent skills

### Issue tracker

Local markdown under `.scratch/<feature-slug>/` (spec.md + issues/NN-slug.md). See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`), used as-is. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context — one `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.

### UI/UX conventions

Before styling or restyling any frontend surface (dropdown, modal, drawer, card, button, etc.), check `docs/ui-conventions.md` for the color/border/radius/shadow/spacing convention already in use for that archetype, and copy it exactly rather than guessing a new value.
