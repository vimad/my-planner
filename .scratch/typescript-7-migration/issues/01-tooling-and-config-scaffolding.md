# 01 — Tooling & config scaffolding

**What to build:** Install TypeScript 7 and stand up `tsconfig.json` for both packages, with the full pipeline (dev server, tests, lint) proven to work end-to-end on one trivial `.ts`/`.tsx` file each — before any real source file is converted. This issue is pure scaffolding and must land first; every other issue depends on it.

**Blocked by:** None — can start immediately

**Status:** ready-for-agent

## Context (TypeScript 7 facts — verify against https://devblogs.microsoft.com/typescript/ if stale)

TypeScript 7.0 (native Go compiler, "tsgo") reached GA 2026-07-08. Install normally: `npm install -D typescript` (or `pnpm add -D typescript` here) — it ships under the regular `latest` tag, no separate package. Confirm you actually got 7.x with `pnpm --filter backend exec tsc --version` / `pnpm --filter frontend exec tsc --version` after installing.

Relevant new defaults/breaking changes vs. TS6 you need to account for in the tsconfigs you write:
- `strict: true` is now the default (write it explicitly anyway, for clarity).
- `types` defaults to `[]` (used to auto-include all `@types/*`). You must list ambient-global-providing packages explicitly or things like `process`, `describe`/`it` (if using Vitest globals), and DOM globals will fail to resolve.
- `module`/`moduleResolution`: classic resolution, AMD/UMD/SystemJS/`none` modules, and `baseUrl` are all removed/unsupported. Use `"nodenext"` (backend) or `"bundler"` (frontend, still fully supported for Vite-style projects) — never `"classic"`.
- `esModuleInterop` can no longer be set to `false` — leave it unset/true.
- The TS Compiler API doesn't exist in 7.0 (coming in 7.1). Not relevant here — this repo has no ts-morph/ts-jest/webpack-ts-loader/Vue-Svelte-Angular template checking, so nothing here depends on it. `oxlint` (this repo's linter) has its own Rust/oxc-based TS parser, not `typescript-eslint`, so it is unaffected either way — but verify (see task list below).

Node.js 24 (confirm with `node --version`, expect v24.x) runs `.ts` files directly via unflagged type-stripping — no build step needed for the backend. Only **erasable** TS syntax works this way: no `enum`, no `namespace` with runtime code, no constructor parameter-property shorthand. Keep this in mind for later issues; nothing to do here except be aware of it.

## Tasks

- [x] `pnpm --filter backend add -D typescript` and `pnpm --filter frontend add -D typescript`; confirm both resolve to a 7.x version.
- [x] Create `packages/backend/tsconfig.json`: `module`/`moduleResolution: "nodenext"`, `target: "esnext"`, `strict: true`, `noEmit: true`, `allowJs: true`, `checkJs: false`, `types: ["node"]` (add `@types/node` as a devDependency too), `esModuleInterop` left default, `resolveJsonModule: true` if any `.json` is imported, `include`/`rootDir` covering `src` (and `test` if you want it typechecked too — decide and note it).
- [x] Create `packages/frontend/tsconfig.json`: `moduleResolution: "bundler"`, `module: "esnext"`, `jsx: "react-jsx"`, `strict: true`, `noEmit: true`, `allowJs: true`, `checkJs: false`, `lib: ["ES2023", "DOM", "DOM.Iterable"]`, `types` including whatever Vitest/jsdom global setup needs (check `vite.config.js`'s `test.globals: true` — figure out the correct types entry for the installed `vitest` version, e.g. `vitest/globals`), plus `@types/react`/`@types/react-dom` (already present as deps — reuse, don't reinstall).
- [x] Add a `"typecheck": "tsc --noEmit"` script to both `packages/backend/package.json` and `packages/frontend/package.json`.
- [x] Verify `oxlint` handles `.ts`/`.tsx` out of the box (it should, being oxc-based) — create one throwaway `.tsx` file with a deliberate lint violation, run `pnpm --filter frontend lint`, confirm it's caught, then delete the throwaway file. Adjust `packages/frontend/.oxlintrc.json` only if something doesn't work by default.
- [x] Smoke-test the full pipeline on one real, low-risk file each, before touching the bulk of the codebase:
  - Backend: convert `packages/backend/src/utils/defaultCategory.js` → `.ts` (small, few/no external deps) with real types. Run `pnpm --filter backend dev` briefly to confirm the server still boots (`node --watch src/server.js` requiring a `.ts` module must work — Node's ESM loader resolves this via extension-less imports if the codebase uses them, or you may need to update the importing file's extension reference; check how `defaultCategory.js` is currently imported and adjust). Run `pnpm --filter backend test` to confirm still green.
  - Frontend: convert `packages/frontend/src/utils/getId.js` → `.ts` (small, no JSX) with real types. Run `pnpm --filter frontend dev` briefly and confirm the app still loads in a browser (no need for deep interaction — this is a pipeline smoke test, not a feature test). Run `pnpm --filter frontend test` to confirm still green.
  - Run `pnpm --filter backend typecheck` and `pnpm --filter frontend typecheck` — both should report zero errors (everything else is still `.js`/`.jsx` under `allowJs`).
- [x] Document any deviation from the config decisions above (if something didn't work as expected) directly in this issue file under a `## Comments` heading, so later issues aren't surprised.

## Comments

**TypeScript version installed:** `7.0.2` in both `packages/backend` and `packages/frontend` (confirmed via `tsc --version` in each package). `@types/node@^26.1.2` added to backend; frontend reused the already-present `@types/react`/`@types/react-dom`.

**`packages/backend/tsconfig.json`** (landed exactly as planned, plus a couple of extras):

```json
{
  "compilerOptions": {
    "target": "esnext",
    "module": "nodenext",
    "moduleResolution": "nodenext",
    "strict": true,
    "noEmit": true,
    "allowJs": true,
    "checkJs": false,
    "types": ["node"],
    "resolveJsonModule": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "rootDir": ".",
    "outDir": "dist"
  },
  "include": ["src/**/*", "test/**/*"]
}
```

Decision: `test/**/*` is included in `include`, so `test/` gets typechecked too (not just `src/`), since the backend test suite (`packages/backend/test/*.test.js`) will be converted in Issue 04 and there's no reason to leave it out of `tsc --noEmit`'s scope. `outDir`/`rootDir` are set defensively even though `noEmit: true` makes them inert right now — harmless, and saves a decision later if a build step is ever added.

**`packages/frontend/tsconfig.json`** (landed exactly as planned, plus one addition):

```json
{
  "compilerOptions": {
    "target": "esnext",
    "module": "esnext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "strict": true,
    "noEmit": true,
    "allowJs": true,
    "checkJs": false,
    "types": ["vite/client", "vitest/globals", "@testing-library/jest-dom"],
    "resolveJsonModule": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "rootDir": "."
  },
  "include": ["src/**/*"]
}
```

`vite.config.js` has `test: { globals: true, environment: 'jsdom', setupFiles: './src/setupTests.js' }`, so `vitest/globals` (confirmed present at `node_modules/vitest/globals.d.ts` for the installed `vitest@4.1.10`) supplies `describe`/`it`/`expect`/etc. as ambient globals. Also added `@testing-library/jest-dom` to `types` — its custom matchers (`toBeInTheDocument()` etc., used via `setupTests.js`'s `import '@testing-library/jest-dom'`) need the ambient augmentation of `expect` too; this wasn't called out explicitly in the plan but follows the same "list anything providing ambient/global augmentation" rule as `vitest/globals`. DOM globals came for free via `lib: ["ES2023", "DOM", "DOM.Iterable"]` — no separate `types` entry needed for those.

**Deviation — import specifiers must reference `.ts`, not `.js`, for hand-written extensioned imports (backend only):** The plan's task text hedged on this ("Node's ESM loader resolves this via extension-less imports … or you may need to update the importing file's extension reference; check and adjust"). Verified empirically: Node 24's native type-stripping does **not** transparently resolve a `.js` import specifier to a sibling `.ts` file — `import('./defaultCategory.js')` throws `Cannot find module`, only `import('./defaultCategory.ts')` resolves. This only affects the **backend**, which uses explicit extensioned relative imports everywhere (`'../utils/defaultCategory.js'`); the **frontend** uses extension-less imports (`'../utils/getId'`) which both Vite and `tsc --noEmit` (bundler resolution) already resolve correctly without any change, so no frontend import sites needed touching.

Concretely: converting `packages/backend/src/utils/defaultCategory.js` → `.ts` required updating its two import sites to point at `.ts`:
- `packages/backend/src/routes/todos.js`: `'../utils/defaultCategory.js'` → `'../utils/defaultCategory.ts'`
- `packages/backend/src/routes/scratchNotes.js`: same change

**Action item for Issue 02/03 (backend):** every backend file being converted from `.js` → `.ts` will need this same treatment — grep the codebase for `from '.../<name>.js'` importing the file being converted and update the specifier to `.ts`. `tsc --noEmit` did **not** catch the stale `.js` specifier as an error (TS's nodenext resolution apparently tolerates it, or resolves through `allowJs` finding nothing and quietly erroring only at runtime) — so **don't rely on `tsc --noEmit` alone to catch this**; the `node --watch`/`node` boot smoke test is what actually caught it. Re-run the dev boot check after every backend conversion, not just at the end.

**oxlint:** worked on `.tsx` out of the box, no `.oxlintrc.json` changes needed. Throwaway file `packages/frontend/src/__oxlint_smoke.tsx` (an unused `const` inside a component) correctly produced an `eslint(no-unused-vars)` warning under the existing config (`plugins: ["react", "oxc"]`), then was deleted.

**Smoke-test files converted (both with real types, not `any`):**
- `packages/backend/src/utils/defaultCategory.ts`: added an explicit return type `Promise<Types.ObjectId | string | null>` (`import type { Types } from 'mongoose'`). Note `Category.js` itself is still plain JS (converted in Issue 02), so under `allowJs`/`checkJs: false` its exports are implicitly `any` — the explicit annotation on `resolveDefaultCategoryId` is the real contract until the model is typed; nothing enforces it against the JS side yet. Issue 02 should double check this annotation still matches once `Category.js` → `.ts` gets a real Mongoose document type.
- `packages/frontend/src/utils/getId.ts`: added an exported `WithId` interface (`{ _id?: string | null; id?: string | null }`) and typed `getId(entity: WithId | null | undefined): string | undefined`. No call sites needed changes — all existing usages (`App.jsx`, `AgendaGroups.jsx`, `CompletedTodos.jsx`, `ScratchNoteCard.jsx`, `Scratchpad.jsx`, `TodoItem.jsx`, `TodoDetail.jsx`) already pass Mongoose-shaped or plain-object entities compatible with the new type, and `checkJs: false` means these `.jsx` call sites aren't type-checked yet anyway (that happens in Issues 06/07/08).

**Verification commands run — all green:**
- `pnpm --filter backend exec tsc --version` / `pnpm --filter frontend exec tsc --version` → `Version 7.0.2` both.
- `pnpm --filter backend typecheck` → exit 0, zero errors.
- `pnpm --filter frontend typecheck` → exit 0, zero errors.
- `pnpm --filter backend test` → 6 files / 72 tests passed.
- `pnpm --filter frontend test` → 11 files / 104 tests passed.
- Backend boot: `node src/server.js` (with Mongo already up via `pnpm db:up`) → `Connected to MongoDB…` / `Backend listening on http://localhost:4100`, then killed.
- Frontend boot: `pnpm --filter frontend dev` → Vite ready, `curl`'d `/` (got the app shell HTML) and `/src/utils/getId.ts` directly (got esbuild-transpiled, type-stripped JS back with a sourcemap) → confirms Vite serves `.ts` transparently. Server killed afterward.
- No real todos/categories were touched — only used the existing `Test`-safe boot/curl checks, no browser interaction with app data.
