# View Modes

Type: prototype
Status: resolved

## Question

What views should the dashboard support for browsing todos day-to-day, and what does each look like?

Candidates raised during charting: by-category board (columns per category), by-priority grouping (High/Medium/Low cutting across categories), by-date/agenda (Today, Tomorrow, This Week, No date), and a flat filterable list. The user explicitly wants to see rough prototypes before deciding which view(s) to keep rather than choosing blind.

Build rough, reactable prototypes of the candidate views (and any others that seem worth showing) via the `/prototype` skill, and settle: which view(s) ship, how you switch between them, and how each interacts with the category-color-coding, priority, and the today-highlight behavior recorded in the map's Notes.

## Answer

Four variants were prototyped via the `/prototype` skill (UI branch, sub-shape B — no existing dashboard page to embed into): **A — Category Board** (Kanban columns per category), **B — Priority Groups** (High/Medium/Low sections cutting across categories), **C — Date Agenda** (small calendar widget + agenda grouped Overdue/Today/Tomorrow/This week/Later/No date), **D — Flat List + Filters** (single priority-sorted list with search and category/priority filters). All four shared a category remaining/completed summary strip and consistent amber highlighting for todos due today.

**Decision: ship Date Agenda (C) as the dashboard's default and, for now, only view.** The small calendar + agenda-by-date layout was judged the most useful for day-to-day use. It's explicitly a *default*, not the only view forever — a view switcher to add Category Board, Priority Groups, or Flat List later is left open (not built now, not ruled out). No switcher UI/mechanism is being designed yet; that's deferred until/unless another view actually gets prioritized.

**Asset / primary source:** the four prototype variants live at `packages/frontend/src/prototype-views/` (`mockData.js`, `VariantCategoryBoard.jsx`, `VariantPriorityGroups.jsx`, `VariantDateAgenda.jsx`, `VariantFlatFiltered.jsx`, `PrototypeSwitcher.jsx`, `PrototypeViewsPrototype.jsx`, `prototype-views.css`), clearly marked as throwaway/PROTOTYPE. This repo isn't a git repository, so per-skill convention of capturing the prototype on a throwaway branch wasn't possible — the files were left in place instead, unwired from `App.jsx` (the temporary `?variant=` hook into `App.jsx` was reverted). To view them again, temporarily re-add a conditional render of `PrototypeViewsPrototype` in `App.jsx`, or mount `VariantDateAgenda` directly.

One incidental finding worth carrying into the real data model: the initial mock computed "today" via `Date#toISOString()` date-slicing, which silently shifts by a day relative to the local calendar depending on timezone. The real implementation should treat due dates as local calendar-day values (not UTC-normalized timestamps) to avoid the same off-by-one bug.
