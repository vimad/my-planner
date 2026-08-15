# my-planner

Scaffolding for a React + Node/Express + MongoDB app, managed as a pnpm workspace.

## Structure

```
packages/
  frontend/   React 19 + Vite + Vitest
  backend/    Express + Mongoose + Vitest
docker-compose.yml   MongoDB for local dev
```

The backend exposes `GET /api/test`, which reads a document from the `test`
collection in MongoDB and returns it (seeded on startup with `{ name: "vinod" }`
if the collection is empty). The frontend fetches that endpoint on load and
displays the value.

## Prerequisites

- Node.js >= 20
- pnpm
- Docker (for MongoDB)

## Setup

```bash
pnpm install
cp packages/backend/.env.example packages/backend/.env
cp packages/frontend/.env.example packages/frontend/.env
```

## Run everything

```bash
pnpm db:up      # starts MongoDB via docker compose
pnpm dev        # runs backend (http://localhost:4100) and frontend (http://localhost:5173) together
```

Open http://localhost:5173 — it should show "Value from database: vinod".

Stop the database with `pnpm db:down` when done.

## Desktop app (macOS)

`packages/desktop` wraps the same frontend in a native Mac app via Tauri — no changes to `packages/frontend`/`packages/backend`, and the backend/MongoDB are still started manually, same as the web version.

One-time setup: install the Rust toolchain (`curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`), then `pnpm install`.

**Daily use (the built app):**

```bash
pnpm db:up
pnpm dev:backend
pnpm build:desktop
open "packages/desktop/src-tauri/target/release/bundle/macos/My Planner.app"
```

First launch: right-click the `.app` → Open, to bypass Gatekeeper (it's unsigned). After that it opens normally.

**While developing** (hot-reload, native window):

```bash
pnpm dev            # terminal 1 — backend + frontend dev server
pnpm dev:desktop    # terminal 2 — attaches to the running dev server on :5173
```

The window remembers its size/position across launches.

## Tests

```bash
pnpm test             # backend + frontend
pnpm test:backend
pnpm test:frontend
```
