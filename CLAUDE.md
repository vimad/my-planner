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

The dev database holds the user's real personal todos. When verifying a feature by driving the actual running app (e.g. via the chrome-devtools MCP), never create, edit, link, complete, or delete a real todo:

- Use a category named `Test` for all verification (create it first if it doesn't already exist).
- Every todo created for a manual test must land in `Test` — via quick-add's category default, or by explicitly setting the category.
- Never mutate a todo outside the `Test` category — no linking real todos to each other, no editing a real todo's notes/fields, no toggling complete, no deleting. Read-only viewing/opening of real todos is fine.
- After verifying, delete the `Test`-category todos created for that session so the category is empty again for next time.
- If a scenario genuinely requires touching real data (e.g. reproducing a bug that only shows up on a specific real todo), stop and confirm with the user first rather than assuming it's fine.

## Agent skills

### Issue tracker

Local markdown under `.scratch/<feature-slug>/` (spec.md + issues/NN-slug.md). See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`), used as-is. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context — one `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.
