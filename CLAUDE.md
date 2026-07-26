# my-planner

A personal, single-user planner web app (no accounts/auth) — categories, todos with priority/tags/due dates/recurrence, a rich-text scratchpad for capturing and promoting quick notes into todos, and a date-agenda dashboard with search. Dark, glassmorphism-style UI.

pnpm workspace with two packages:

- `packages/backend` — Express + Mongoose (MongoDB)
- `packages/frontend` — React + Vite

## Commands

- `pnpm db:up` / `pnpm db:down` — start/stop MongoDB (docker compose)
- `pnpm dev` — run backend + frontend together
- `pnpm test` — run all tests (Vitest)
