# 06 — Frontend: components, part 1 (simple)

**What to build:** Convert the smaller/simpler React components (and their tests) to `.tsx`: `CategoryChip`, `CategoryForm`, `ConfirmDialog`, `ThemeToggle`, `TagInput`, `MiniCalendar`.

**Blocked by:** 05

**Status:** ready-for-agent

## Context

React 19 + Vite (esbuild/oxc handles the actual `.tsx` transpilation — `tsc` is type-check-only via the `typecheck` script). `@types/react`/`@types/react-dom` are already installed. `packages/frontend/tsconfig.json`: `jsx: "react-jsx"`, `strict: true`, `moduleResolution: "bundler"`, `allowJs: true` (other components stay `.jsx` for now, that's fine).

Props should get explicit `interface`/`type` declarations (e.g. `interface CategoryChipProps { name: string; color: string; onClick?: () => void }`) rather than inferred/`any`. Read each component's current usage sites (where it's rendered, e.g. in `App.jsx` or a parent component) to confirm the real prop shapes rather than guessing from the component body alone.

## Tasks

- [x] Convert `packages/frontend/src/components/CategoryChip.jsx` → `.tsx`.
- [x] Convert `packages/frontend/src/components/CategoryForm.jsx` → `.tsx`.
- [x] Convert `packages/frontend/src/components/ConfirmDialog.jsx` → `.tsx`.
- [x] Convert `packages/frontend/src/components/ThemeToggle.jsx` → `.tsx`.
- [x] Convert `packages/frontend/src/components/TagInput.jsx` → `.tsx`.
- [x] Convert `packages/frontend/src/components/MiniCalendar.jsx` → `.tsx`.
- [x] Convert the matching test files: `MiniCalendar.test.jsx`, `TagInput.test.jsx` → `.tsx` (check which of the other four also have test files under `packages/frontend/src/components/` and convert those too — re-check the directory listing rather than assuming only these two).
- [x] Run `pnpm --filter frontend typecheck` — zero errors for these files.
- [x] Run `pnpm --filter frontend test` — must stay green.
- [x] Run `pnpm --filter frontend dev`, open the app in a browser, sanity-check these components render (category chips, category create/edit form, a confirm dialog, theme toggle, tag input, mini calendar) — read-only interaction is fine; per root `CLAUDE.md`, do not create/edit/link/delete real todos/categories during this check, use the `Test` category if you need to exercise anything that touches data.

## Comments

The agent that ran this issue stalled (no-progress watchdog) partway through the final browser sanity-check step, mid-way through viewing `TagInput` inside a real todo's edit dialog ("Chamiru's feedback", not `Test`-category). It had explicitly decided to close via Cancel rather than Save to avoid any mutation, but didn't get to execute that click before stalling.

Picked up by the coordinating session: confirmed independently that all 6 files (`CategoryChip.tsx`, `CategoryForm.tsx`, `ConfirmDialog.tsx`, `ThemeToggle.tsx`, `TagInput.tsx`, `MiniCalendar.tsx`) plus `MiniCalendar.test.tsx`/`TagInput.test.tsx` were already converted and the file diff/checkboxes were already in place — verified `pnpm --filter frontend typecheck` (0 errors) and `pnpm --filter frontend test` (11 files / 104 tests passed) directly. The stalled dialog was closed via **Cancel** (confirmed via snapshot — the todo list afterward shows "Chamiru's feedback" unchanged, no title/body/date mutation), and the leftover dev server process (port 5175) was killed. No real data was created, edited, or deleted. Issue considered complete.
