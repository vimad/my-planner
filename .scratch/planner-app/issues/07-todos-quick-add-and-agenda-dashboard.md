# 07 — Todos: quick-add, Date Agenda dashboard, complete/reopen

**What to build:** A user can add a todo by typing just a title and hitting enter. The dashboard shows a small calendar widget and an agenda grouped by due date (Overdue / Today / Tomorrow / This week / Later / No date). Todos due today are automatically highlighted wherever they appear. Checking a todo off completes it (and un-checking reopens it), and category counts update accordingly.

**Blocked by:** 06 — App shell + Categories

**Status:** ready-for-agent

- [ ] Backend has a Todo model (`title`, `categoryId` defaulting to Uncategorized, `completed` boolean default `false`, `dueDate` as a local `YYYY-MM-DD` string or null) and REST routes: quick-create (title only), list, complete/reopen (toggle), delete
- [ ] Frontend has a title-only quick-add input that creates a todo with a single action
- [ ] The dashboard shows a small calendar widget marking which days have due todos, per [View Modes](../issues/02-view-modes.md)
- [ ] The dashboard's main list is an agenda grouped into Overdue / Today / Tomorrow / This week / Later / No date, computed from each todo's `dueDate` — reference structure at `packages/frontend/src/prototype-views/` (structural reference only, not to be copied as-is)
- [ ] Todos due today are visually highlighted wherever they render on the dashboard, and the highlight is computed live from the current date, not a stored flag
- [ ] Checking a todo off marks it completed and removes it from the open agenda; unchecking reopens it
- [ ] Category chip counts (remaining/completed) update to reflect real todos
- [ ] Due dates are stored and compared as local calendar-day strings, never round-tripped through `Date#toISOString()` — see the technical constraint in [the spec](../spec.md)
- [ ] Backend routes are tested via `createApp()` + supertest with mocked models
- [ ] Frontend agenda grouping, today-highlight, and quick-add are tested via React Testing Library with `fetch` mocked
