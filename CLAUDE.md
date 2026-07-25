# my-planner

pnpm workspace with two packages:

- `packages/backend` — Express + Mongoose (MongoDB)
- `packages/frontend` — React + Vite

## Commands

- `pnpm db:up` / `pnpm db:down` — start/stop MongoDB (docker compose)
- `pnpm dev` — run backend + frontend together
- `pnpm test` — run all tests (Vitest)
