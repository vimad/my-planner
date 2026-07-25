# 06 — App shell + Categories

**What to build:** Replace the bare scaffold with the real app's foundation: Tailwind CSS and the "Vibrant Dark" base layout, plus full category management. A user can create categories with a name and a color, see them rendered as colorful chips on the dashboard showing remaining/completed counts, rename or delete the ones they created, and the system-provided "Uncategorized" category is always present as the fallback.

**Blocked by:** None — can start immediately

**Status:** ready-for-agent

- [ ] Tailwind CSS is installed and configured in `packages/frontend` (Vite plugin), replacing the current plain-CSS scaffold styling
- [ ] The dashboard route renders the "Vibrant Dark" base layout (dark gradient background, gradient-text heading, glassmorphism card treatment) as the app's real entry point, replacing the current `/api/test` scaffold display — see [Visual Design & Styling Approach](../issues/03-visual-design.md) and the reference prototype at `packages/frontend/src/prototype-views/design/` (visual reference only, not to be copied as-is)
- [ ] Backend has a Category model (name, color) and REST routes: create, list (each with `remaining`/`completed` counts computed from Todos), rename, delete
- [ ] A system-provided "Uncategorized" category is seeded on startup and cannot be deleted via the API
- [ ] Creating/editing a category lets the user pick a color from a curated palette (a concrete set of hex values chosen at implementation time, per [Further Notes on the spec](../spec.md))
- [ ] Categories render as colorful chips on the dashboard showing "N remaining · M completed"
- [ ] Backend routes are tested via `createApp()` + supertest with the Category model mocked, following the existing convention in `packages/backend/test/test.route.test.js`
- [ ] Frontend category chip rendering is tested via React Testing Library with `fetch` mocked, following the existing convention in `packages/frontend/src/App.test.jsx`
