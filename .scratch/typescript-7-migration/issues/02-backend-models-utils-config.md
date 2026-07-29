# 02 — Backend: models, utils, config

**What to build:** Convert the backend's data-layer files to TypeScript: the 4 Mongoose models, the 2 utils, and `config/db.js`. This establishes the typed vocabulary (Mongoose document interfaces) that routes will consume in Issue 03.

**Blocked by:** 01 (tooling scaffolding must be in place)

**Status:** ready-for-agent

## Context

This is a `pnpm` workspace; backend is Express 5 + Mongoose 9, run directly by Node (no build step) via `node --watch src/server.js` / `node src/server.js`. TypeScript 7 is now installed with `packages/backend/tsconfig.json` set up (`module`/`moduleResolution: "nodenext"`, `strict: true`, `allowJs: true` so unconverted files still work alongside these). Node 24 executes `.ts` directly via unflagged type-stripping, but **only erasable syntax** — no `enum`, no `namespace`, no constructor parameter-property shorthand (`constructor(private x)`). Write plain interfaces/types and object literals, not those constructs.

Files already converted in Issue 01 as a smoke test: `src/utils/defaultCategory.js` → `.ts` (check how it turned out and follow the same conventions).

## Tasks

- [x] Convert `packages/backend/src/models/Category.js`, `Todo.js`, `ScratchNote.js`, `Settings.js` → `.ts`. For each Mongoose model: define a TypeScript interface for the document shape (e.g. `interface CategoryDoc { name: string; color: string; ... }`) and type the schema/model with Mongoose's generics (`Schema<CategoryDoc>`, `model<CategoryDoc>(...)`) rather than leaving fields implicitly `any`. Look at each schema's actual field definitions (types, `required`, `default`, refs) to derive accurate TS types — don't guess; read the existing `.js` source closely.
- [x] Convert `packages/backend/src/utils/tiptapText.js` → `.ts` (the other util alongside the already-converted `defaultCategory.ts`).
- [x] Convert `packages/backend/src/config/db.js` → `.ts`.
- [x] Update every import site within `packages/backend/src` that references these files (routes, `app.js`, `seed.js`, `server.js` — even though those stay `.js` until Issue 03) so imports still resolve. Under Node's ESM resolution, check whether existing imports use explicit `.js` extensions (common in this codebase's ESM style) — if so, they can keep pointing at `.js` per TS/Node convention (TS resolves `.js` specifiers to the sibling `.ts` file), but verify this actually works with `node --watch` rather than assuming.
- [x] Run `pnpm --filter backend typecheck` — zero errors for the converted files (other files remain untyped `.js` under `allowJs`, that's fine for now).
- [x] Run `pnpm --filter backend test` — must stay green (models are exercised indirectly via route tests).
- [x] Run `pnpm --filter backend dev` briefly, confirm the server still boots cleanly against the dev DB connection (no need to hit endpoints — that's Issue 03/04's job once routes are converted too).

## Comments

**Files converted:** `src/models/Category.ts`, `src/models/Todo.ts`, `src/models/ScratchNote.ts`, `src/models/Settings.ts`, `src/utils/tiptapText.ts`, `src/config/db.ts`. All old `.js` siblings deleted.

**Typed interfaces landed:**

- `CategoryDoc` (`models/Category.ts`): `{ name: string; color: string; system: boolean; createdAt: Date; updatedAt: Date }`. `Schema<CategoryDoc>` + `mongoose.model<CategoryDoc>('Category', categorySchema)`.
- `TodoDoc` (`models/Todo.ts`): `title: string`, `categoryId: Types.ObjectId`, `completed: boolean`, `dueDate: string | null`, `priority: TodoPriority` (`'High' | 'Medium' | 'Low'`, exported), `tags: string[]`, `officeLinked: boolean`, `body: TiptapNode | null`, `bodyText: string`, `recurrence: TodoRecurrence | null`, `linkedTodoIds: Types.ObjectId[]`, `createdAt`/`updatedAt: Date`. `TodoRecurrence` (`{ pattern: 'daily' | 'weekly' | 'monthly' }`) is its own exported interface, backed by its own typed nested `Schema<TodoRecurrence>` (`recurrenceSchema`) rather than an inline anonymous schema, since that's the cleanest way to get real typing on the nested subdocument. `body`/`recurrence` field comments preserved verbatim from the original `.js` (they carry load-bearing domain context — office-day linking, no-cascade invariant, etc.).
- `ScratchNoteDoc` / `ScratchLine` (`models/ScratchNote.ts`): `ScratchLine = { id: string; content: TiptapNode | null; promotedTodoId: Types.ObjectId | null }` (own `Schema<ScratchLine>`, `_id: false`), `ScratchNoteDoc = { body: ScratchLine[]; archived: boolean; createdAt: Date; updatedAt: Date }`.
- `SettingsDoc` (`models/Settings.ts`): `{ nextOfficeDay: string | null; createdAt: Date; updatedAt: Date }`.
- `TiptapNode` (`utils/tiptapText.ts`, exported): `{ type?: string; text?: string; content?: TiptapNode[]; [key: string]: unknown }` — minimal recursive shape covering only what `tiptapToPlainText` and the `Mixed`-typed `body`/`content` fields need. Imported into `Todo.ts` and `ScratchNote.ts` so those Mixed fields aren't bare `any`. `tiptapToPlainText(doc: unknown): string` — kept the parameter as `unknown` (not `TiptapNode`) since callers pass raw Mongoose `Mixed` values of uncertain shape; narrows internally.
- `db.ts`: `connectDB(uri: string): Promise<Connection>`, `disconnectDB(): Promise<void>`, using `mongoose`'s own exported `Connection` type.

**Surprise for Issue 03 — new tsconfig option needed: `allowImportingTsExtensions`.** Issue 01 only exercised a `.ts` file importing a still-`.js` sibling (`defaultCategory.ts` → `Category.js`), so it never hit this. Once a `.ts` file imports another `.ts` file using an explicit `.ts` specifier (required for the Node runtime resolution reason Issue 01 documented — Node does *not* map `.js` specifiers to sibling `.ts` files), `tsc --noEmit` itself refuses it by default: `TS5097: An import path can only end with a '.ts' extension when 'allowImportingTsExtensions' is enabled.` Added `"allowImportingTsExtensions": true` to `packages/backend/tsconfig.json` (safe/standard pairing with `noEmit: true`, which was already set). **Issue 03 will hit this immediately** — `app.js`/`server.js`/`seed.js`/routes all need their model/util/config import specifiers changed from `.js` → `.ts`, and this flag is now already in place so `tsc --noEmit` won't complain when they do.

**Import sites updated (all within `src`, `.js` specifier → `.ts`):**
- `src/utils/defaultCategory.ts`: `'../models/Category.js'` → `'../models/Category.ts'`
- `src/seed.js`: `'./models/Category.js'` → `'./models/Category.ts'`
- `src/server.js`: `'./config/db.js'` → `'./config/db.ts'`
- `src/routes/todos.js`: `'../models/Todo.js'` → `.ts`, `'../utils/tiptapText.js'` → `.ts`
- `src/routes/scratchNotes.js`: `'../models/ScratchNote.js'` → `.ts`, `'../models/Todo.js'` → `.ts`
- `src/routes/categories.js`: `'../models/Category.js'` → `.ts`
- `src/routes/settings.js`: `'../models/Settings.js'` → `.ts`

Note `seed.js`/`server.js`/`app.js`/routes themselves are *not* converted to `.ts` in this issue (that's Issue 03) — only their import specifiers for the now-`.ts` models/utils/config were updated, since those specifiers must resolve correctly under plain Node execution today (untyped `.js` files importing typed `.ts` files works fine, per `allowJs`).

**Test files intentionally left untouched (`packages/backend/test/*.test.js`):** several use `vi.mock('../src/models/ScratchNote.js', ...)` / `await import('../src/models/Todo.js')` etc., still pointing at the now-nonexistent `.js` model paths. Left as-is per this issue's scope (tests are Issue 04's job) and verified it's safe: Vitest/Vite's module resolver is more lenient than Node's native loader and falls back from a requested `.js` specifier to a sibling `.ts` file, so `vi.mock`'s specifier and the route file's real `'../models/X.ts'` import both resolve to the same module id and the mock applies correctly (spot-checked `test/scratchNotes.route.test.js` with `--reporter=verbose`, all 18 tests pass and clearly exercise the mocked model, not a real DB). **Issue 04 should still normalize these to `.ts`/proper specifiers when it converts the test files**, but nothing is broken today.

**Verification commands run — all green:**
- `pnpm --filter backend typecheck` → exit 0, zero errors (after adding `allowImportingTsExtensions`).
- `pnpm --filter backend test` → 6 files / 72 tests passed (same count as Issue 01's baseline).
- Dev boot: `node src/server.js` (Mongo already up via `pnpm db:up`, container `my-planner-mongo`) → `Connected to MongoDB at mongodb://localhost:27017/my-planner` / `Backend listening on http://localhost:4100`, then killed; port confirmed free afterward. Did not hit any endpoints (that's Issue 03/04's job) and touched no real todos/categories.
