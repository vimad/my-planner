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

## Tests

```bash
pnpm test             # backend + frontend
pnpm test:backend
pnpm test:frontend
```
