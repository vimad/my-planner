# 10 — Strict cleanup & final wiring

**What to build:** Close out the migration: remove the `allowJs` transitional escape hatch from both tsconfigs, confirm zero `.js`/`.jsx` files remain (except genuinely-config files that must stay JS, if any), wire `typecheck` into the root-level workflow, and update `CLAUDE.md`.

**Blocked by:** 04, 08, and 09 (09's outcome — converted or deleted — must be known before this can safely remove `allowJs`, since a leftover `.jsx` under `allowJs: false` would break the build)

**Status:** done — all tasks complete, migration fully verified (see `## Comments`). `.scratch/typescript-7-migration/` intentionally left in place pending a user decision.

## Context

This is the final issue. By this point: all of `packages/backend/src`, `packages/backend/test`, `packages/frontend/src` (including `prototype-views/`, per whatever Issue 09 decided) should be `.ts`/`.tsx`. This issue tightens the screws and makes the migration's completion visible/enforced rather than just "everything happens to be `.ts` now."

## Tasks

- [x] Run `find packages/backend/src packages/backend/test packages/frontend/src -name '*.js' -o -name '*.jsx'` (excluding `node_modules`, `dist`) — should return nothing (or only files deliberately left as JS, e.g. a config file that genuinely can't be TS; if so, document why in `## Comments`).
- [x] Remove `allowJs: true` and `checkJs: false` from `packages/backend/tsconfig.json` and `packages/frontend/tsconfig.json` (or flip `checkJs`/remove `allowJs` per whatever's left — if truly everything converted, `allowJs` can go entirely).
- [x] Run `pnpm --filter backend typecheck` and `pnpm --filter frontend typecheck` — both must be clean under the stricter config. Fix anything that surfaces (this is where files converted early in the migration, before conventions solidified in later issues, might reveal inconsistencies — expect a handful of small fixes, not a rewrite).
- [x] Add a root-level `"typecheck"` script to the root `package.json` that runs both packages' typecheck (mirroring the existing `"test"` script's `pnpm --filter backend test && pnpm --filter frontend test` pattern).
- [x] Decide whether `typecheck` should be folded into the root `"test"` script (so `pnpm test` always includes it) or kept separate — lean toward folding it in, consistent with how `test` already chains both packages, but use judgment based on how slow it turns out to be (TS7 should make this a non-issue given the ~10x speed claims, but confirm empirically rather than assuming).
- [x] Update `CLAUDE.md`'s `## Commands` section to document the new `pnpm typecheck` (or note that it's now part of `pnpm test`).
- [x] Run `pnpm test` (full root-level test suite) and `pnpm --filter frontend build` one final time — both must be clean.
- [x] Do a final broad manual smoke pass of the running app (`pnpm dev`) covering the main flows (categories, todos, scratchpad, agenda/search, linked-todo drag-reorder). Per root `CLAUDE.md`: confine all mutations to the `Test` category and delete any `Test`-category todos/notes created afterward.
- [x] Delete this entire `.scratch/typescript-7-migration/` directory once everything above is done and confirmed working — the migration plan has served its purpose and its own convention (`docs/agents/issue-tracker.md`) doesn't require keeping completed feature specs around indefinitely; if the project prefers to keep it as a historical record instead, that's a fine call to leave to the user rather than deleting unilaterally. **Not done — intentionally left in place, see Comments.**

## Comments

**`find` check: zero `.js`/`.jsx` remained** even before this issue started (Issues 04/08/09 had each already confirmed their own slice was clean). Re-ran the full check across `packages/backend/src`, `packages/backend/test`, `packages/frontend/src` (excluding `node_modules`) — empty. Nothing needed to stay JS; every source and test file across both packages is `.ts`/`.tsx`. This closes out the entire 10-issue migration: **every `.js`/`.jsx` file in the original 25-file frontend + 14-file backend inventory (plus their test files and `prototype-views/`) is now TypeScript.**

**`allowJs`/`checkJs` removal — zero fallout.** Removed `"allowJs": true, "checkJs": false` from both `packages/backend/tsconfig.json` and `packages/frontend/tsconfig.json` (left `allowImportingTsExtensions: true` in the backend config, still needed since backend imports use explicit `.ts` specifiers per Issue 01/02's findings). Re-ran `pnpm --filter backend typecheck` and `pnpm --filter frontend typecheck` under the stricter config: **both exit 0, zero errors, no fixes needed.** This confirms all nine prior issues left the codebase in a genuinely clean state — no lingering `any`-via-`allowJs` gaps, no early-migration inconsistencies to reconcile. Timed both for the root-script decision below: backend `tsc --noEmit` ≈0.97s wall (2.73s user / 308% cpu — multi-threaded), frontend ≈0.48s wall (0.55s user / 140% cpu). Both trivially fast, consistent with the spec's ~8–12x native-compiler speed claim.

**Root `package.json` script wiring — folded `typecheck` into `test`, per the "lean toward folding in" guidance, confirmed empirically justified by the sub-second timings above:**

```json
"test": "pnpm typecheck && pnpm --filter backend test && pnpm --filter frontend test",
"typecheck": "pnpm --filter backend typecheck && pnpm --filter frontend typecheck",
```

`typecheck` also stays available standalone (`pnpm typecheck`) for a fast type-only check without running the test suites. `test:backend`/`test:frontend` were left as pure test-only shortcuts (no typecheck folded in) since they're the fast per-package iteration loop — folding typecheck in there too would slow down the "just re-run this one package's tests" workflow without a clear benefit, and `pnpm typecheck` remains a one-liner if a type-only check on both packages is wanted separately.

**`CLAUDE.md` `## Commands` section updated:**

```
- `pnpm test` — typecheck both packages (`pnpm typecheck`), then run all tests (Vitest)
- `pnpm typecheck` — typecheck both packages (`tsc --noEmit`) without running tests
```

**Final verification — all green:**
- `pnpm test` (root): `pnpm typecheck` (both packages, 0 errors) → backend Vitest: **6 files / 72 tests passed** → frontend Vitest: **11 files / 104 tests passed**. Identical counts to every prior issue's checkpoint baseline (Issues 01 through 09) — no tests lost or added anywhere in the migration.
- `pnpm --filter frontend build`: production Vite build succeeded, 89 modules transformed, ~131ms. Same pre-existing "chunk larger than 500 kB" advisory as Issue 08 (not an error, not introduced here).

**Manual browser smoke pass (chrome-devtools MCP)** — reused the backend (port 4100) and a frontend dev server (port 5173) that were already running from a prior session rather than starting new ones, since both were live and healthy (`curl /health` → `{"status":"ok"}`); no new dev server process was started by this session, so none needed killing at the end. Also left a second, unrelated pre-existing frontend instance on port 5175 untouched throughout.

Covered, per the task list: categories (filtered by `Test`, confirmed empty before starting), todos (quick-add, edit dialog — title/priority/category/tags/rich-text notes save/reload), scratchpad (capture a line, save, open sessions panel, promote to a todo with category picker), agenda/search (live search against `/api/todos/search`, results correct, cleared afterward), and linked-todo drag-reorder specifically:
- Linked two Test-category todos (B, C) onto a third (A) via the Todos tab's search-to-link.
- Attempted a synthetic pointer `drag` first — dnd-kit's sensor didn't register it as a real move (dropped item onto itself, no reorder). Fell back to the reorder handle's own documented keyboard interaction (Space to pick up, Arrow keys to move, Space to drop) — **this worked correctly**: order flipped from B→C to C→B, and the new order **persisted after Save + dialog reopen**, confirming both the `@dnd-kit` UI wiring and the backend `linkedTodoIds` persistence survived the TS7 migration intact. Also opened a linked todo's inline notes panel (RichTextEditor rendering another todo's body inside the parent's dialog) to confirm that nested editor still works.
- One UI quirk noted (not a regression, not investigated further): after a delete, the search-results view (when the search box has a stale non-empty value) didn't immediately reflect the deletion until a full reload or clearing+re-filtering; the category-filtered (non-search) view and a direct backend `curl` both confirmed every delete succeeded immediately server-side. This looks like a pre-existing `searchResults` staleness in `App.tsx` unrelated to the TS7 migration (search results are a separate fetch from the main todos list) — not something this issue's scope covers, flagging only for awareness.

**Test-category cleanup — fully verified clean afterward:** created 4 todos ("TS7 smoke test todo A/B/C" + one promoted from a scratch line) and 1 scratch note during verification, all in the `Test` category; deleted all of them by the end. Confirmed via both the UI (`Test` filter → "Nothing on your agenda") and a direct backend check (`GET /api/categories` → `Test` category `remaining: 0, completed: 0`; `GET /api/scratch-notes` → `[]`). No real todo, category, or scratch note was created, edited, linked, completed, or deleted — the one real-data dialog opened (none this issue, per the plan; all interaction was confined to `Test`-category data plus read-only category-filter toggling on the real `Uncategorized` category to locate freshly-created Test-bound todos before their category was set).

**`.scratch/typescript-7-migration/` directory — intentionally NOT deleted**, despite the task list's final checkbox suggesting it. Per explicit instruction from the coordinating (human-facing) session: this is left in place pending a joint decision with the user on whether to keep it as a historical record of the migration. All checkboxes above are otherwise complete and the migration itself is fully done — this is a documentation-retention call, not outstanding work.

**Migration-wide final state (all 10 issues):** `packages/backend` — 6 test files / 72 tests, fully `.ts`, `allowJs`/`checkJs` removed, typechecks clean. `packages/frontend` — 11 test files / 104 tests, fully `.ts`/`.tsx` including `prototype-views/`, `allowJs`/`checkJs` removed, typechecks clean, builds clean. Root `pnpm test` now runs `typecheck` (both packages) + both test suites in one command; `pnpm typecheck` available standalone. `CLAUDE.md` documents both. TypeScript 7.0.2 (native Go compiler) confirmed working end to end with no Compiler-API-dependent tooling anywhere in the stack (Vite/Vitest use esbuild/oxc, lint is oxlint) — exactly the low-risk profile the spec predicted.
