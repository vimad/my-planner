# Status view UI

Type: prototype
Status: open
Blocked by: 03, 05

## Question

Map is [Sprint (Jira Integration) — Phase 1 Planning Map](../map.md).

Build a rough, reactable prototype (per the `/prototype` skill) of the Status view — a Jira-board-style, read-only, per-person, per-sprint view (columns like To Do / Dev WIP / Review / Testing WIP / To Be Merged / Merged / Done, mirroring the reference screenshot), informed by the settled data model (ticket 03) and sync semantics (ticket 05):

- Person + sprint selector.
- Board-style columns grouped by the locally-mirrored status set.
- The per-person "sync" button and its scoped-sync behavior/feedback, including last-synced timestamps.
- A one-click "open in Jira" affordance on each ticket card, opening the real ticket in a new tab.
- Check `docs/ui-conventions.md` for card/board conventions to reuse rather than inventing new styling.

Blocked by tickets 03 and 05 — the data model and sync semantics must be settled first.
