# 09 — Frontend: prototype-views (optional / lowest priority)

**What to build:** Convert `packages/frontend/src/prototype-views/` (11 files: `CategorySummaryStrip.jsx`, `PrototypeSwitcher.jsx`, `PrototypeViewsPrototype.jsx`, `VariantCategoryBoard.jsx`, `VariantDateAgenda.jsx`, `VariantFlatFiltered.jsx`, `VariantPriorityGroups.jsx`, `mockData.js`, plus `design/{DesignVariantDark,DesignVariantPastel,DesignVariantVivid,DesignVariantsPrototype}.jsx` and `design/useAgendaData.js`) to TypeScript — **or confirm with the user that this directory should be deleted/excluded instead.**

**Blocked by:** 01 only (no code dependency on the other frontend issues — this directory is a self-contained design-exploration playground, not imported by `App.tsx` or any real component)

**Status:** done — converted to TypeScript per explicit user confirmation (see `## Comments`).

## Context

If conversion is confirmed as the right call: same Vite/React/esbuild pipeline as the rest of the frontend, but looser typing is acceptable here (this is exploratory/reference code, not production surface) — `any` in a few spots is fine where the mock data shapes are genuinely loose, as long as `pnpm --filter frontend typecheck` still passes cleanly (no unchecked `.js`/`.jsx` left once done, since Issue 10 removes `allowJs` for the whole package).

## Tasks

- [x] Confirm with the user whether to convert or delete this directory before doing either. — **Resolved: user confirmed convert, do not delete.**
- [x] **If converting:** convert all 11 files to `.ts`/`.tsx` as appropriate (components → `.tsx`, `mockData.js`/`useAgendaData.js` → `.ts`). Update `prototype-views.css`/`design/*.css` imports if any file references now need updating (CSS files themselves don't change).
- [ ] **If deleting:** remove `packages/frontend/src/prototype-views/` entirely, and check `App.jsx`/`App.tsx` (by this point, likely already `.tsx` from Issue 08) and any router/dev-only entry point for references to `PrototypeSwitcher` or similar that would need removing too. — N/A, not deleted.
- [x] Either way, run `pnpm --filter frontend typecheck` and `pnpm --filter frontend test` to confirm the package is still clean.
- [x] Record the decision (converted vs. deleted) in this file under a `## Comments` heading — Issue 10 needs to know which outcome happened to do its final `allowJs` removal correctly.

## Comments

**Outcome: converted (not deleted).** The user was asked directly and confirmed converting to TypeScript, keeping the directory. Issue 10 can proceed on the assumption that `prototype-views/` is fully typed — no `.js`/`.jsx` remain in it, so it's safe to include in the final `allowJs` removal along with the rest of the frontend.

All 13 files (the issue text says "11" but lists 13 by name) renamed via `git mv` and converted:
- `CategorySummaryStrip.jsx` → `.tsx` (no type changes needed — inference from typed `mockData.ts` was sufficient)
- `PrototypeSwitcher.jsx` → `.tsx` (added `SwitcherVariant` interface — `{ key: string; name: string; Component: ComponentType }` — and a `PrototypeSwitcherProps` interface)
- `PrototypeViewsPrototype.jsx` → `.tsx`
- `VariantCategoryBoard.jsx` → `.tsx` (no type changes needed)
- `VariantDateAgenda.jsx` → `.tsx`
- `VariantFlatFiltered.jsx` → `.tsx` (no type changes needed)
- `VariantPriorityGroups.jsx` → `.tsx`
- `mockData.js` → `.ts` (added `Priority`, `Category`, `Todo` types — everything else in the directory infers from these)
- `design/DesignVariantDark.jsx`, `design/DesignVariantPastel.jsx`, `design/DesignVariantVivid.jsx` → `.tsx` (no type changes needed, inferred from `useAgendaData.ts`)
- `design/DesignVariantsPrototype.jsx` → `.tsx`
- `design/useAgendaData.js` → `.ts`

No `any` was needed anywhere — the mock data shapes turned out to type cleanly with real interfaces (`Priority`/`Category`/`Todo` in `mockData.ts`), contrary to the issue's expectation that loose typing might be required. Type errors fixed along the way (real bugs strict mode caught, not mock-data looseness):
- `tiers.map((tier) => ...)` in `VariantPriorityGroups.tsx` indexed `priorityColor: Record<Priority, string>` with a widened `string`, since `const tiers = ['High', 'Medium', 'Low']` inferred as `string[]`. Fixed by annotating `const tiers: Priority[] = [...]`.
- `Date - Date` arithmetic (`new Date(dueDate) - new Date(TODAY_ISO)`) doesn't type-check under strict mode; changed to `.getTime() - .getTime()` in both `VariantDateAgenda.tsx`'s and `design/useAgendaData.ts`'s `groupLabel()`.
- `Array.prototype.find()` returns `T | undefined`; `VARIANTS.find((v) => v.key === variant).Component` in both `PrototypeViewsPrototype.tsx` and `design/DesignVariantsPrototype.tsx` needed a `?? VARIANTS[0]` fallback.
- `readVariantFromUrl()` returned `string | null` (from `URLSearchParams.get()`) in a ternary that didn't narrow; changed the condition to `key && VARIANTS.some(...)` so the true-branch narrows `key` to `string`, and added an explicit `: string` return type, in both switcher-prototype files.
- `document.activeElement?.isContentEditable` — `isContentEditable` isn't on `Element`, only `HTMLElement`; cast to `(document.activeElement as HTMLElement | null)?.isContentEditable` in both keyboard-nav effects.

No import specifiers needed updating beyond the extension change itself — this directory uses extension-less relative imports throughout (`./mockData`, `../mockData`, `./useAgendaData`, etc.), which both Vite and `tsc` (bundler resolution) already resolve without a `.js`/`.ts` suffix, matching the frontend-wide pattern noted in Issue 01's Comments (the `.js`→`.ts` extension-rewrite requirement is a backend-only concern). CSS imports (`./prototype-views.css`, `./dark.css`, `./pastel.css`, `./vivid.css`) are untouched — filenames didn't change.

**Verification commands run — all green:**
- `pnpm --filter frontend typecheck` → exit 0, zero errors.
- `pnpm --filter frontend test` → 11 files / 104 tests passed (no prototype-views-specific tests exist, consistent with pre-conversion state).
- `pnpm --filter frontend lint` → clean for this directory (one pre-existing unrelated warning in `components/Scratchpad.jsx`, outside this issue's scope).
- Confirmed zero `.js`/`.jsx` files remain under `packages/frontend/src/prototype-views/`.
- Confirmed nothing outside `prototype-views/` imports from it (`grep -rn "prototype-views"` across `src` turned up no references), so no other files needed touching.
