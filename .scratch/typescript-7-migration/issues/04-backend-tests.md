# 04 — Backend: tests

**What to build:** Convert the 6 backend test files to TypeScript, and close out the backend side of the migration.

**Blocked by:** 03

**Status:** ready-for-agent

## Context

Backend tests use Vitest + Supertest (`packages/backend/test/*.test.js`), run via `vitest run` (config: `packages/backend/vitest.config.js`). All backend source (`models`, `utils`, `config`, `routes`, `app`, `server`, `seed`) is already `.ts` by this point. `packages/backend/tsconfig.json` has `types: ["node"]` — check whether it also needs Vitest's global types if these tests use `describe`/`it`/`expect` without importing them explicitly (check current `.js` test files for `import { describe, it, expect } from 'vitest'` vs. relying on globals — match whatever convention already exists, don't introduce `globals: true` if the tests currently import explicitly).

## Tasks

- [x] Convert `packages/backend/test/todos.route.test.js`, `categories.route.test.js`, `categories-todo-counts.route.test.js`, `scratchNotes.route.test.js`, `settings.route.test.js`, `tiptapText.test.js` → `.ts`.
- [x] Convert `packages/backend/vitest.config.js` → `.ts` if not already covered by a shared config decision from Issue 01.
- [x] If the `tsconfig.json`'s `include` from Issue 01 didn't already cover `test/`, extend it so tests are typechecked too.
- [x] Run `pnpm --filter backend typecheck` — zero errors across all of `packages/backend`.
- [x] Run `pnpm --filter backend test` — must be fully green.
- [x] This closes out the backend package. Confirm there are no remaining `.js` files under `packages/backend/src` or `packages/backend/test` (a stray one is fine to leave for Issue 10's final sweep, but flag it here in a `## Comments` note if so).

## Comments

**Files converted:** all 6 test files → `.ts` (`todos.route.test.ts`, `categories.route.test.ts`, `categories-todo-counts.route.test.ts`, `scratchNotes.route.test.ts`, `settings.route.test.ts`, `tiptapText.test.ts`), plus `vitest.config.ts`. All old `.js` siblings deleted.

**`tsconfig.json`'s `include`:** already had `"include": ["src/**/*", "test/**/*"]` from Issue 01 — verified, no change needed.

**`.js` specifiers normalized everywhere** (static imports, `vi.mock()` calls, and dynamic `await import()`), e.g. `vi.mock('../src/models/Todo.js', ...)` → `vi.mock('../src/models/Todo.ts', ...)`, `await import('../src/app.js')` → `await import('../src/app.ts')`, and `tiptapText.test.ts`'s static `import { tiptapToPlainText } from '../src/utils/tiptapText.ts'`. The old lenient-fallback quirk (Vitest resolving a `.js` specifier to a sibling `.ts` file) that Issues 02/03 flagged is gone — every specifier now points at the real `.ts` file directly. Also updated two lingering `.js`-era filename mentions in `categories-todo-counts.route.test.ts`'s prose comment (`categories.js`/`Todo.js` → `categories.ts`/`Todo.ts`) for accuracy; left the one genuine `dateAgenda.js` reference in `src/models/Todo.ts`'s comment alone since that points at the still-unconverted frontend file (out of this issue's scope).

**New devDependency needed: `@types/supertest`.** `tsc --noEmit` failed with `TS7016: Could not find a declaration file for module 'supertest'` on every route test file the moment they became `.ts` (this was previously silent under `allowJs`/`checkJs: false`, since the `.js` test files were never typechecked). Added `@types/supertest@^7.2.1` as a backend devDependency — same "typecheck only surfaces gaps once the file itself is `.ts`" pattern Issue 03 hit with `@types/express`/`@types/cors`.

**Typing strategy for `vi.mock()`-doubled Mongoose models — the main design decision this issue had to make.** All five route test files destructure the mocked model straight off `await import('../src/models/X.ts')`, e.g. `const { Todo } = await import('../src/models/Todo.ts')`. Typed naively, that import resolves against the *real* module's exported type (`mongoose.Model<TodoDoc>` — Issue 02/03's real Mongoose statics), not against the `vi.mock()` factory's plain-object-of-`vi.fn()`s shape that actually exists at runtime (TS has no visibility into `vi.mock`'s runtime factory for import-type purposes). Calling `Todo.create.mockResolvedValue(...)` against the real `Model<TodoDoc>` type fails to typecheck — `create` there is a real overloaded Mongoose static, not a `Mock`.

Resolved by defining a small local interface per file (e.g. `MockedTodoModel { find: Mock; create: Mock; findById: Mock; ... }`, using vitest's exported `Mock` type) that mirrors the `vi.mock()` factory's own keys exactly, then casting the destructured import: `const { Todo } = (await import('../src/models/Todo.ts')) as unknown as { Todo: MockedTodoModel }`. This is honest (it describes exactly what's true at runtime — a plain object of `vi.fn()` stubs, nothing more), self-documenting (the interface is a visible manifest of what the factory replaces), and required zero changes to any of the existing `Todo.create.mockResolvedValue(...)` / `.mock.calls[0]` call sites, since bare (unparameterized) `Mock` from `@vitest/spy` defaults its `Procedure` type param to `(...args: any[]) => any`, so every mock-inspection method (`mockResolvedValue`, `mockReturnValue`, `.mock.calls`, etc.) stays permissive. Applied in `categories.route.test.ts`, `scratchNotes.route.test.ts`, `settings.route.test.ts`, and `todos.route.test.ts`.

**One test (`categories-todo-counts.route.test.ts`) needed a second, narrower cast.** That file deliberately imports the *real* (unmocked) `Todo` model — see its own header comment, preserved verbatim — so `Todo` there really is `mongoose.Model<TodoDoc>`, and it uses `vi.spyOn(Todo, 'countDocuments').mockImplementation(...)` instead of `vi.mock()`. Mongoose's real `countDocuments` is a heavily overloaded static returning `QueryWithHelpers<number, ...>` (a thenable Query object, not a literal `Promise<number>`), which doesn't accept a `(filter) => Promise.resolve(n)` implementation without a fight over overload resolution. Cast the replacement implementation function itself — `(...) as unknown as typeof Todo.countDocuments` — before handing it to `.mockImplementation()`, the same kind of narrow, deliberate escape hatch Issue 03 used for its `categoryId` cast in `todos.ts`/`scratchNotes.ts`. Preserves runtime behavior exactly (the mock still resolves the same counts); only the compile-time overload fight is bypassed.

**Small necessary tweak beyond pure conversion:** several `save: vi.fn().mockResolvedValue()` call sites (`scratchNotes.route.test.ts`, `todos.route.test.ts`) needed an explicit `undefined` argument (`.mockResolvedValue(undefined)`) — `MockInstance.mockResolvedValue(value: Awaited<MockReturnType<T>>): this` takes a required parameter (not optional), so a zero-arg call doesn't typecheck even though the resolved value is meant to be `undefined`. No behavior change — `vi.fn().mockResolvedValue(undefined)` resolves to `undefined`, identical to the old zero-arg call.

**Verification commands run — all green:**
- `pnpm --filter backend typecheck` → exit 0, zero errors across all of `packages/backend` (`src` + `test`) — first time the whole backend package typechecks clean end to end.
- `pnpm --filter backend test` → 6 files / 72 tests passed (same count as the Issue 01 baseline, and every prior issue's checkpoint).
- `find packages/backend/src packages/backend/test -name '*.js' -not -path '*/node_modules/*'` → empty. Also swept the rest of `packages/backend` (excluding `node_modules`/`dist`) for any other stray `.js`: none found. **Nothing to flag for Issue 10** — the entire `packages/backend` tree (`src`, `test`, and config: `tsconfig.json`, `vitest.config.ts`) is TypeScript. Only non-code files remain `.env`/`.env.example` (not applicable) and `package.json` (JSON, never converts).

**This closes out the entire backend track of the migration (Issues 01–04).** `packages/backend` is fully `.ts`, typechecks clean, and its test suite is green — ready for Issue 10's final cleanup pass (removing `allowJs`/`checkJs: false` and wiring `typecheck` into CI) once the frontend track (Issues 05–09) also lands.
