# Status view UI

Type: prototype
Status: resolved
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

## Answer

Three structurally different variants were prototyped (per the `/prototype` skill) — A: single board with a top toolbar (person/sprint selectors + scoped sync, the most literal mirror of the reference screenshot), B: roster sidebar (per-person sync icon + count/staleness, dense single-line ticket rows), C: swimlanes (multi-select "spotlight" of several people at once against shared columns). All three drove the settled Status data model (ticket 03) and simulated the settled sync semantics (ticket 05): a per-person Lightweight sync discovers new tickets with only `status`+`title` filled in (shown with a muted "?" type badge) and bumps `lastSyncedAt` on already-cached tickets without touching their other fields.

**Variant B won**, combined with one piece of A and one revision:

- **Roster + per-person sync** (from B): a left-hand roster lists the team, each row showing ticket count + last-synced + its own sync icon — "sync scoped to this person" lives spatially on the person, not a global toolbar control.
- **Ticket card** (from A, not B's original dense row): key, title, type badge, stream badge, sync time, and the "open in Jira" affordance — richer than B's single-line row.
- **The revision**: the board only renders a status column the selected person actually has a ticket in right now, rather than all seven locally-mirrored statuses with blank placeholders for the empty ones. Captured as [ADR 0003](../../../docs/adr/0003-status-view-only-shows-occupied-columns.md) — a single person rarely spans most of a seven-status workflow at once, so showing every possible column read as mostly empty space around a small cluster of real cards.

Prototype captured on branch `prototype/sprint-status-view-variants` (`packages/frontend/src/prototype-views/sprint-status/`, wired at `/prototype/sprint-status` in that branch's `App.tsx`) — all three original variants plus the winning revision to B are preserved there as the primary source; nothing was folded into `main` since this map's destination is a written spec, not shipped code.
