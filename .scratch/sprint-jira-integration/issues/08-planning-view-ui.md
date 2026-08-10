# Planning view UI

Type: prototype
Status: open
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
