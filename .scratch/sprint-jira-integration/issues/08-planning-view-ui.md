# Planning view UI

Type: prototype
Status: resolved
Blocked by: 02, 03, 04

## Question

Map is [Sprint (Jira Integration) — Phase 1 Planning Map](../map.md).

Build a rough, reactable prototype (per the `/prototype` skill) of the Planning view for a selected team + sprint, informed by the user's reference spreadsheet screenshot and the settled data model (ticket 03) and capacity formula (ticket 04):

- The per-person capacity table (Role, Person, Leave, Total, Available, Planned, Remaining) driven by the real formula, not spreadsheet-guessed numbers.
- The ticket-entry interaction: entering a bare ticket number, title/details auto-loading from the cached/synced `Ticket` model.
- Where "unmapped assignee" tickets surface.
- The manual "sync" button and its placement/feedback (loading, last-synced state per ticket).
- The active-epics-for-this-sprint list with click-through to a detail view.
- Check `docs/ui-conventions.md` for table/card/button conventions to reuse rather than inventing new styling.

Blocked by tickets 02, 03, and 04 — the data model and formula must be settled before the UI can be built against real shapes.

## Answer

Three structurally different variants were prototyped (per the `/prototype` skill) — A: spreadsheet mirror (dense capacity + ticket tables, epics sidebar), B: kanban by assignee (compact capacity cards, per-person ticket grouping, epics as a pill strip with a modal detail), C: split focus panel (capacity as a most-loaded-first sidebar list, a Tickets/Epics tab workspace with in-place epic drill-down). All three drove the real capacity formula (ticket 04) and simulated the settled sync semantics (ticket 05) against mock data.

**Variant B won**, with one revision made mid-review: the original per-person ticket board (full ticket cards in per-person columns) was replaced with a flat "Tickets by person" summary table — one row per person, with that person's planned tickets rendered as small ticket-number badges, drag-and-drop reorderable within their row (same `@dnd-kit` sortable pattern as `TodoDetail.tsx`'s linked-todo list and `BoardsView.tsx`). The "unmapped assignee" case gets the same row shape at the bottom of the table, labeled and flagged amber, rather than a separate column or a flagged row within a ticket table.

The rest of Variant B stands as prototyped:
- **Capacity**: compact per-person cards (role, a planned/available progress bar, remaining hours, leave days) in a horizontal strip — not a dense table.
- **Epics**: a horizontal pill strip (title + done/total rollup); clicking one opens a full modal (ui-conventions archetype B) with a stub detail view (real version deep-links to Jira).
- **Ticket entry**: a single "Add to plan — WOSMVP-<input>" bar; typing a number and submitting simulates the Full sync of that ticket + its sub-tasks (ticket 05).
- **Sync**: one global "Sync plan" button only — deliberately no per-ticket resync affordance, since the sync-semantics ticket only defined two actions (single-entry, sync-all).

**Open question surfaced during review**: whether the per-person badge order needs to persist (a new field, e.g. an `order` on `SprintPlanEntry` scoped per assignee) or is a disposable same-session arrangement. Not answered here — split out as [Per-person ticket order: persisted or session-only?](10-planning-ticket-order-persistence.md).

Prototype captured on branch `prototype/sprint-planning-view-variants` (`packages/frontend/src/prototype-views/sprint-planning/`, wired at `/prototype/sprint-planning` in that branch's `App.tsx`) — all three variants plus the winning revision to B are preserved there as the primary source; nothing was folded into `main` since this map's destination is a written spec, not shipped code.
