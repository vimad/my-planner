# 03 — Backend: routes, app, server, seed

**What to build:** Convert the remaining backend runtime files — the 4 route modules, `app.js`, `server.js`, `seed.js` — to TypeScript, using the typed models/utils from Issue 02.

**Blocked by:** 02

**Status:** ready-for-agent

## Context

Express 5 + Mongoose 9 backend, no build step — Node 24 runs `.ts` directly via unflagged type-stripping (erasable syntax only: no `enum`/`namespace`/parameter-property shorthand). `packages/backend/tsconfig.json` already exists (`strict: true`, `allowJs: true` still on so this can land incrementally file-by-file if you prefer, though converting all of these together in one pass is reasonable since they're tightly coupled).

Models (`Category`, `Todo`, `ScratchNote`, `Settings`) and utils (`defaultCategory`, `tiptapText`) are already `.ts` with typed document interfaces — import and reuse those types for request bodies / response shapes rather than re-declaring them.

## Tasks

- [x] Convert `packages/backend/src/routes/categories.js`, `scratchNotes.js`, `todos.js`, `settings.js` → `.ts`. Type Express handlers' `req`/`res` (e.g. `Request<Params, ResBody, ReqBody>` from `express` — Express 5 ships its own types, confirm `@types/express` isn't separately needed or add it if it is). Type request-body shapes explicitly rather than leaving them implicit `any`; reuse the Mongoose document interfaces from Issue 02 where a route's input/output shape matches a model.
- [x] Convert `packages/backend/src/app.js` → `.ts`.
- [x] Convert `packages/backend/src/server.js` → `.ts`. Update `packages/backend/package.json`'s `dev`/`start` scripts (`node --watch src/server.js` → `src/server.ts`) — confirm Node 24's type-stripping actually runs it directly without extra flags; if you hit a non-erasable-syntax error, fix the offending construct rather than reaching for `--experimental-transform-types` unless there's a genuine need for `enum`/parameter-properties.
- [x] Convert `packages/backend/src/seed.js` → `.ts`.
- [x] Update `main` field in `packages/backend/package.json` if it still points at `src/server.js`.
- [x] Run `pnpm --filter backend typecheck` — zero errors.
- [x] Run `pnpm --filter backend dev`, hit a couple of real endpoints manually (e.g. `curl localhost:<port>/api/categories`) to confirm routing/serialization still works end-to-end — this is a read-only GET check against the dev DB, not a mutation; do not create/edit/delete data as part of this check (see root `CLAUDE.md` — the dev DB holds real personal data).
- [x] Run `pnpm --filter backend test` — must stay green (route tests exercise these files directly).

## Comments

**Files converted:** `src/routes/categories.ts`, `src/routes/scratchNotes.ts`, `src/routes/todos.ts`, `src/routes/settings.ts`, `src/app.ts`, `src/server.ts`, `src/seed.ts`. All old `.js` siblings deleted. `package.json`: `main` → `src/server.ts`, `dev` → `node --watch src/server.ts`, `start` → `node src/server.ts`.

**`@types/express` and `@types/cors` were both needed.** Confirmed empirically: `node_modules/express` (5.2.1) and `node_modules/cors` (2.8.6) ship no `.d.ts` files at all (no `types`/`typings` field in either `package.json`, no `*.d.ts` anywhere in either package tree) — Express 5 does **not** ship its own types, contrary to the task text's hedge. Added both as devDependencies: `@types/express@^5.0.6` (matches the installed Express 5.x major) and `@types/cors@^2.8.19` (needed because `app.ts` imports `cors` directly for the `cors({ origin })` call). Neither needed adding to `tsconfig.json`'s `types` array — that array only controls auto-included *ambient/global* `.d.ts` files; `@types/express`/`@types/cors` are resolved automatically via normal module resolution when you `import ... from 'express'` / `'cors'`, same as any other `@types/*` package backing a named import.

**Typed request/response shapes landed (for Issue 04's reference):**

- **`categories.ts`**: `CategoryBody { name?: string; color?: string }` for both POST and PATCH bodies (optional even though the model requires both — client payload is unvalidated until the handler checks it). `getCounts(categoryId: mongoose.Types.ObjectId | string): Promise<{ remaining: number; completed: number }>`. The `mongoose.model('Todo')` registry lookup (no generic — see the route's existing comment on why it can't statically import the Todo model) is untyped/`any`-ish by design, matching the runtime's own dynamic-lookup intent.
- **`scratchNotes.ts`**: `IncomingScratchLine { id?: string; content?: TiptapNode | null }` (client line shape, missing the server-owned `promotedTodoId`). `CreateScratchNoteBody { body?: unknown }` (normalized via `normalizeNewLines`, which does its own runtime `Array.isArray` guard, so `unknown` is honest). `PatchScratchNoteBody { body?: IncomingScratchLine[]; archived?: boolean }`. `ArchiveScratchNoteBody { archived?: boolean }`. `PromoteLineBody { lineId?: string; categoryId?: string; priority?: TodoPriority; dueDate?: string | null }`. `extractText` retyped to take `TiptapNode | TiptapNode[] | null | undefined` (it's called both on a line's `content` and recursively on `node.content` arrays).
- **`todos.ts`**: `CreateTodoBody { title?, categoryId?: string, dueDate?: string | null, priority?: TodoPriority, tags?: string[], body?: TiptapNode | null, officeLinked?: boolean }`; `UpdateTodoBody extends CreateTodoBody` adding `recurrence?: TodoRecurrence | null` and `linkedTodoIds?: string[]`. The PATCH handler's `update` object is typed `Partial<TodoDoc>` rather than a loose `Record<string, unknown>` — reuses the model type directly per the issue's guidance.
- **`settings.ts`**: `UpdateSettingsBody { nextOfficeDay?: string | null }`; PATCH's `update` object typed `Partial<SettingsDoc>`.
- **`app.ts`**: `CreateAppOptions { corsOrigin?: string }` for `createApp()`'s options param (was an untyped destructured default `{}` before).

**Two `as unknown as TodoDoc['categoryId']` casts, both deliberate and narrow — Issue 04 doesn't need to touch these, just be aware they exist:** in `todos.ts`'s POST handler and `scratchNotes.ts`'s `/promote` handler, `resolveDefaultCategoryId()` returns `Promise<Types.ObjectId | string | null>` (Issue 02's signature — it can return `null` if the Uncategorized category is ever missing at boot), but `Todo.create()`'s generated type for the required `categoryId` field doesn't accept `null` in its casting union. The original `.js` behavior was to pass `null` straight through and let Mongoose's own required-field validation reject it at runtime — the cast preserves that exact behavior (no new guard added) while satisfying `tsc`. Did **not** widen `TodoDoc.categoryId`'s type or add a runtime null-check, since that would be a behavior change out of this issue's scope.

**One small behavior-preserving simplification:** in `scratchNotes.ts`'s `/promote` handler, the original `.js` had `line.promotedTodoId = todo._id ?? todo.id` (a defensive `??` also seen in `categories.js`'s `getCounts` call and `defaultCategory.ts`). Typed strictly, `todo._id ?? todo.id` has type `Types.ObjectId | string`, which doesn't assign to `ScratchLine.promotedTodoId`'s `Types.ObjectId | null`. Since `_id` is always set on a doc returned by `Todo.create(...)` (the `?? todo.id` branch is unreachable there), simplified to `line.promotedTodoId = todo._id` — functionally identical, just doesn't type-check the dead branch. Left `categories.ts`'s `category._id ?? category.id` pattern untouched since there it's just a function parameter typed as `ObjectId | string`, so no widening problem arises.

**Test files intentionally left untouched (`packages/backend/test/*.test.js`):** all 5 route test files still `await import('../src/app.js')` (now a nonexistent path) and `vi.mock('../src/models/*.js', ...)`. Confirmed again (same as Issue 02's finding) that Vitest's resolver falls back from a `.js` specifier to the sibling `.ts` file, so nothing is broken — `pnpm --filter backend test` is green (72/72). Left as Issue 04's job per this issue's scope.

**Verification commands run — all green:**
- `pnpm --filter backend typecheck` → exit 0, zero errors (two rounds of fixes needed first — see the `categoryId` cast note above; `tsc` caught both immediately with precise overload-resolution errors pointing at `Todo.create`).
- `pnpm --filter backend test` → 6 files / 72 tests passed (same count as Issues 01/02's baseline).
- Dev boot: `pnpm --filter backend dev` (`node --watch src/server.ts`, Mongo already up via existing `my-planner-mongo` container) → `Connected to MongoDB at mongodb://localhost:27017/my-planner` / `Backend listening on http://localhost:4100`.
- Read-only curl checks against the real dev DB, all returned well-formed JSON: `GET /health` → `{"status":"ok"}`; `GET /api/categories` → array of categories each with live `remaining`/`completed` counts (confirms the `mongoose.model('Todo')` registry-lookup wiring in `getCounts` still works now that both `categories.ts` and `todos.ts` are TS); `GET /api/settings` → the singleton settings doc; `GET /api/todos/tags` → sorted distinct tags array; `GET /api/todos/search?q=zzzznonexistentzzz` → `[]`; `GET /api/scratch-notes` → `[]`. No todos/categories/notes were created, edited, or deleted — GET-only, per root `CLAUDE.md`. Server killed afterward; port 4100 confirmed free.
