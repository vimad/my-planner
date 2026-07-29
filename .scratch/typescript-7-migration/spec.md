# Spec: Migrate to TypeScript 7

**Status:** ready-for-agent

## Problem Statement

The whole codebase (`packages/backend`, `packages/frontend`) is currently plain JavaScript — `.js`/`.jsx`, no `tsconfig.json` anywhere, no `typescript` dependency. The user wants the project converted to TypeScript, specifically **TypeScript 7** (the new Go-based native compiler, package name still `typescript`, npm `latest` tag).

TypeScript 7.0 reached GA on 2026-07-08 (RC shipped 2026-06-18) — it is three weeks old as of this spec. It is a ground-up rewrite of the compiler/language-service in Go ("tsgo"/Corsa), not an incremental release, so normal TS-upgrade priors are unreliable. Key facts gathered from the TypeScript devblog and coverage at spec-writing time (verify against https://devblogs.microsoft.com/typescript/ if anything here seems off — this space is moving fast):

- Install via the normal `npm install -D typescript` — 7.0 ships under the standard `latest` tag, no separate package.
- ~8–12x faster full builds than TS 6 (native Go compiler, shared-memory multithreading).
- New hard-default breaking changes: ES5 target removed, `downlevelIteration` removed, classic module resolution removed, AMD/UMD/SystemJS/`none` modules removed, `baseUrl` removed (use `paths` relative to project root), `esModuleInterop`/`allowSyntheticDefaultImports` can no longer be set `false`, `alwaysStrict` is always on.
- New tsconfig defaults: `strict: true`, `module: "esnext"`, `noUncheckedSideEffectImports: true`, `stableTypeOrdering: true` (non-configurable), **`types: []`** (previously defaulted to including all `@types/*` packages — now you must list ambient-global-providing packages explicitly, e.g. `"types": ["node"]`, `"types": ["vitest/globals"]`).
- `moduleResolution: "bundler"` is still supported and is the recommended setting for Vite-style bundler projects — no change needed there.
- The old Compiler API ("Strada") does not exist in tsgo/7.0. A replacement API is coming in 7.1, not 7.0. This matters only for tooling that programmatically drives the TS compiler (ts-morph, ts-jest, Vue/Svelte/Angular template checkers, custom webpack TS loaders). **This repo has none of that** — Vite/Vitest transpile TS via esbuild/oxc (not the TS compiler API), and lint is `oxlint` (a Rust/oxc-based linter with its own TS parser, not `typescript-eslint`). This is a low-risk migration target for that reason.
- Node.js 24 (LTS, what this machine runs — confirmed `node --version` → v24.11.1) executes `.ts` files directly with unflagged type-stripping (on by default since Node 24.3.0) — no build step needed for the backend. **Caveat: only "erasable" TS syntax is stripped** — no `enum`, no `namespace` with runtime code, no constructor parameter-property shorthand (`constructor(private x: string)`). The backend must avoid those constructs, or scripts must add `--experimental-transform-types` if a real need for one comes up.

Sources consulted: [Announcing TypeScript 7.0](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/), [Announcing TypeScript 7.0 RC](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0-rc/), [Announcing TypeScript Native Previews](https://devblogs.microsoft.com/typescript/announcing-typescript-native-previews/), [Node.js TypeScript docs (v24.x)](https://nodejs.org/docs/latest-v24.x/api/typescript.html).

**Whoever picks up any issue below should re-verify against the live devblog before making config decisions if TS7 has moved since 2026-07-29** — this is new enough that details may still be shifting.

## Solution

Migrate incrementally, file group by file group, keeping the app runnable and tests green at every step (`allowJs: true` during the transition so unconverted `.js`/`.jsx` files keep working alongside newly-converted `.ts`/`.tsx` ones). No behavior changes — this is a type-safety/tooling migration only, not a refactor. Add real types (Mongoose schemas/documents, Express request/response shapes, React component props) rather than blanket `any`.

The work is split into 10 self-contained issues, each scoped to a fresh-context agent (roughly 5–10 files each). They are mostly sequential (later issues depend on types established earlier), with two exceptions noted below that can run in parallel if picked up by different agents.

## File Inventory (at spec time)

- **Backend** (`packages/backend/src`): 14 files — `server.js`, `seed.js`, `app.js`, `config/db.js`, `utils/defaultCategory.js`, `utils/tiptapText.js`, `models/{ScratchNote,Todo,Category,Settings}.js`, `routes/{categories,scratchNotes,todos,settings}.js`. Plus 6 files in `packages/backend/test/`.
- **Frontend** (`packages/frontend/src`): 25 core files (`App.jsx`, `main.jsx`, `setupTests.js`, `constants/categoryColors.js`, `utils/{dateAgenda,getId,linkify,theme}.js` + tests, `components/*.jsx` — 12 components + their `.test.jsx` files). Plus 11 files under `prototype-views/` (throwaway design-exploration code — see Issue 09).

## Implementation Decisions

- **`typescript` installed per-package** (`packages/backend`, `packages/frontend`), matching the existing pattern where each package owns its own dev tooling (see root vs. per-package `package.json`).
- **Backend**: no bundler/build step added. Keep running via `node --watch src/server.ts` / `node src/server.ts`, relying on Node 24's native type-stripping. `tsconfig.json`: `module`/`moduleResolution: "nodenext"`, `target: "esnext"`, `noEmit: true` (Node executes the `.ts` directly; `tsc` is used only for type-checking via a new `typecheck` script), `strict: true`, explicit `types` array.
- **Frontend**: Vite/esbuild keep doing the actual transpilation (unchanged). `tsconfig.json`: `moduleResolution: "bundler"`, `module: "esnext"`, `jsx: "react-jsx"`, `noEmit: true`, `strict: true`, explicit `types` array (`vite/client` for `import.meta.env` etc.).
- **`allowJs: true` + `checkJs: false`** in both tsconfigs during the migration so mixed `.js`+`.ts` trees keep building; **removed in the final cleanup issue (10)** once every file is converted.
- **`types: []` gotcha**: explicitly list `"node"` (backend), and whatever Vitest/jsdom/testing-library need for globals (`vitest/globals` if `globals: true` in vitest config relies on ambient types — confirm exact package name against installed `vitest` version) — don't leave this to the empty default or ambient globals like `process`, `describe`, `it` will fail to resolve.
- **`prototype-views/`** is explicitly lower priority — it's design-exploration/throwaway code per its own naming and CLAUDE.md context. Issue 09 handles it last and is allowed to use looser typing; if the user would rather delete it than convert it, that's a legitimate outcome of that issue (flagged for a quick check, not assumed).
- **No behavior changes.** Every issue's Definition of Done includes "existing tests still pass" and, where applicable, "app still starts (`pnpm dev`) and works" — this is a type migration, not a feature or refactor.

## Issue Sequence

| # | Issue | Depends on | Can parallelize with |
|---|-------|-----------|----------------------|
| 01 | Tooling & config scaffolding | — | — |
| 02 | Backend: models + utils + config | 01 | 05 |
| 03 | Backend: routes + app + server + seed | 02 | 05, 06, 07 |
| 04 | Backend: tests | 03 | 05, 06, 07, 08 |
| 05 | Frontend: utils + constants | 01 | 02 |
| 06 | Frontend: components part 1 (simple) | 05 | 03, 04 |
| 07 | Frontend: components part 2 (complex) | 06 | 03, 04 |
| 08 | Frontend: entry point + App + vite config | 07 | 04 |
| 09 | Frontend: prototype-views (optional/lowest priority) | 01 | anything after 01 |
| 10 | Strict cleanup, remove `allowJs`, wire `typecheck` into CI/scripts | 04, 08 (09 if done) | — |

Each issue file under `issues/` is self-contained (restates the relevant TS7 facts) so it can be handed to a fresh agent without requiring this spec as prior context, though reading this spec first is still recommended.
