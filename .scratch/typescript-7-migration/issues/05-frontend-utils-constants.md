# 05 — Frontend: utils + constants

**What to build:** Convert the frontend's non-component helper files (and their tests) to TypeScript: `constants/categoryColors.js`, `utils/{dateAgenda,getId,linkify,theme}.js` and their `.test.js` counterparts. These have no JSX, so they're the lowest-risk frontend files and establish shared types (e.g. date-agenda grouping shapes) that components will consume later.

**Blocked by:** 01 (can run in parallel with Issue 02, since backend and frontend are independent packages)

**Status:** ready-for-agent

## Context

Frontend is Vite 8 + React 19, transpiled by Vite/esbuild (not `tsc` — `tsc` here is type-checking only, via the `typecheck` script from Issue 01). `packages/frontend/tsconfig.json` already exists (`moduleResolution: "bundler"`, `jsx: "react-jsx"`, `strict: true`, `allowJs: true`). `src/utils/getId.js` was already converted to `.ts` in Issue 01 as a smoke test — check its conventions and match them.

Tests use Vitest + Testing Library, jsdom environment, configured in `packages/frontend/vite.config.js` (`test.globals: true`, `test.setupFiles: './src/setupTests.js'`). Since `globals: true` is set, test files likely use `describe`/`it`/`expect` without importing them — for `.ts` test files to type-check under that pattern, `packages/frontend/tsconfig.json`'s `types` array needs the right Vitest globals entry (check what Issue 01 landed on; add/fix it here if it's missing and these test files fail to typecheck because of it).

## Tasks

- [x] Convert `packages/frontend/src/constants/categoryColors.js` → `.ts`.
- [x] Convert `packages/frontend/src/utils/dateAgenda.js`, `linkify.js`, `theme.js` → `.ts` (leave `getId.ts`, already done).
- [x] Convert `packages/frontend/src/utils/dateAgenda.test.js`, `linkify.test.js` → `.ts`.
- [x] Give real return/parameter types throughout — these are pure functions, good candidates for precise types (avoid `any`; use union types / discriminated objects where the existing JS logic implies them, e.g. date-agenda grouping keys).
- [x] Update any import sites elsewhere in the frontend that reference these files (component files still in `.jsx` at this point can keep importing them fine — extensionless/`.js`-style imports resolve to the new `.ts` under `allowJs` + bundler resolution, but verify Vite's dev server actually picks it up, not just `tsc`).
- [x] Run `pnpm --filter frontend typecheck` — zero errors for these files.
- [x] Run `pnpm --filter frontend test` — must stay green.
- [x] Run `pnpm --filter frontend dev` briefly, confirm no console errors related to these modules.

## Comments

**Files converted (all via `git mv` to preserve history, then rewritten with types):**
- `constants/categoryColors.ts` — added `export interface CategoryColor { name: string; hex: string }`; `CATEGORY_COLORS: CategoryColor[]`.
- `utils/theme.ts` — added `export type Theme = 'light' | 'dark'`; `getInitialTheme(): Theme`, `applyTheme(theme: Theme): void`.
- `utils/linkify.ts` — added `export interface LinkSegment { text: string; href?: string }`; `linkify(text: string | null | undefined): LinkSegment[]`. `match` typed as `RegExpExecArray | null` for the `while` loop assignment.
- `utils/dateAgenda.ts` — this is the one with real design decisions, see below.
- `utils/dateAgenda.test.ts`, `utils/linkify.test.ts` — converted with no logic changes; `describe`/`it`/`expect` resolve via the `vitest/globals` entry in `types` from Issue 01, no explicit imports needed (matches existing style, imports were already explicit anyway via `import { describe, expect, it } from 'vitest'` so nothing changed there).

**`dateAgenda.ts` types — load-bearing for Issues 06/07 (components consume these):**
- `export type GroupLabel = 'Overdue' | 'Today' | 'Tomorrow' | 'This week' | 'Later' | 'No date'` — a string-literal union, not a bare `string`. `GROUP_ORDER: GroupLabel[]` and `groupLabel(...): GroupLabel` both use it. Any component switching/rendering on group labels (e.g. `AgendaGroups.jsx`) can and should narrow on this union once converted, instead of a loose `string`.
- `export interface DueDateFields { dueDate?: string | null; officeLinked?: boolean }` — the minimal shape `effectiveDueDate` needs. **This is deliberately not a full `Todo` type** — no shared `Todo` interface exists yet anywhere in the frontend as of this issue (components still pass ad hoc object literals / Mongoose-shaped docs). When Issues 06/07 introduce a real `Todo` type (for `AgendaGroups.jsx`, `TodoItem.jsx`, `TodoDetail.jsx`, etc.), make sure it's structurally compatible with `DueDateFields` (i.e. has `dueDate?: string | null` and `officeLinked?: boolean`) so `effectiveDueDate(todo, ...)` keeps type-checking without a cast — or just replace `DueDateFields` with (a subset of) the new `Todo` type at that point, whichever reads better in context.
- `parseLocalDate`'s date-diff math was changed from implicit `Date - Date` subtraction (works in JS via `valueOf`, and actually also compiles fine under TS since `Date` has a `symbol.toPrimitive`-free but `valueOf`-based numeric conversion) to explicit `.getTime()` calls on both sides before subtracting, purely for clarity/certainty under `strict: true` — no behavior change, same diff-day math, all existing tests (including the month-rollover regression test) still pass unmodified.
- `effectiveDueDate`'s `nextOfficeDay` param and return type are `string | null | undefined` / `string | null` respectively — matches existing call-site nullability (`null` used in tests/JSX, `undefined` possible when a prop is simply omitted).

**Import sites:** grepped the whole frontend `src/` for references to these four modules. All call sites (`App.jsx`, `components/AgendaGroups.jsx`, `components/CategoryForm.jsx`, `components/MiniCalendar.jsx`, `components/TodoItem.jsx`) already use extensionless imports (e.g. `from '../utils/dateAgenda'`), so **no import-site edits were needed** — confirmed both `tsc --noEmit` and Vite's dev server (via `curl`ing `/src/App.jsx` from the running dev server) resolve them to the new `.ts` files automatically. No `.jsx`/`App.jsx` files were edited, per the confinement instructions for this issue.

**Verification — all green:**
- `pnpm --filter frontend typecheck` → exit 0, zero errors.
- `pnpm --filter frontend test` → 11 files / 104 tests passed, unchanged from Issue 01's baseline.
- `pnpm --filter frontend dev` → booted on port 5175 (5173/5174 already in use by other running instances, left untouched); curl'd `/`, `/src/utils/dateAgenda.ts`, `/src/utils/linkify.ts`, `/src/utils/theme.ts`, `/src/constants/categoryColors.ts` — all served as type-stripped JS; curl'd `/src/App.jsx` and confirmed its `theme` import was rewritten by Vite to `/src/utils/theme.ts`. No console/log errors in the dev server output. Server killed afterward (only the instance this issue started, on port 5175).
- `pnpm --filter frontend lint` (oxlint) → one pre-existing warning in `Scratchpad.jsx` (unrelated file, not touched here), zero warnings/errors in any of the five converted files.
- No real todos/categories touched — verification was read-only `curl` against the dev server, no browser interaction with app data.
