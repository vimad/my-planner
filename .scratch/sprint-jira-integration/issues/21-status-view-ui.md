# 21 — Status view UI

**What to build:** The Status view — a per-person, sprint-scoped, Jira-board-style read-only view. Demoable: pick a team, pick a person from the roster sidebar, sync them, and see their current tickets grouped into only the status columns they actually occupy. See `.scratch/sprint-jira-integration/spec.md` ("Status view UI"); prior art on branch `prototype/sprint-status-view-variants` (`packages/frontend/src/prototype-views/sprint-status/`); [ADR 0003](../../../docs/adr/0003-status-view-only-shows-occupied-columns.md).

**Blocked by:** 15 — Status view backend: Status model + Lightweight sync; 16 — Sprint navigation shell.

**Status:** ready-for-human

- [x] `/sprint/:teamSlug/status` renders a sprint selector plus a left-hand roster sidebar listing the team's `TeamMembership`s, each row showing that person's cached ticket count, last-synced relative time, and its own per-person sync icon (triggers `POST /api/status-sync`, ticket 15).
- [x] Selecting a person renders their board: columns come from `GET /api/statuses` (ticket 15) but **only the ones that person currently has a ticket in** are rendered — an empty-but-possible column (e.g. "Merged" with nothing there) is omitted entirely, not shown blank. See ADR 0003.
- [x] Ticket card (richer than a bare row): key, title, type badge (muted "?" if the ticket was only ever Lightweight-synced and its type is unknown), stream badge, sync time, and a one-click "open in Jira" link (new tab, `{JIRA_BASE_URL}/browse/{jiraKey}`).
- [x] Frontend tests cover: syncing a person populates their board, only occupied columns render (verify at least one empty-but-possible column is absent), a Lightweight-synced ticket shows the muted unknown-type badge, and "open in Jira" links to the right URL.

## Comments

Implemented per checklist above. Notes for reviewers:

- Ticket 15 shipped `POST /api/status-sync` (per-person Lightweight sync) and `GET /api/statuses`, but nothing to read back *cached* tickets for a whole roster without syncing everyone first — needed for the roster sidebar's per-row ticket count/last-synced. Added the missing read path this ticket actually needs: `GET /api/tickets?teamId=&sprintId=` (`packages/backend/src/routes/tickets.ts`), scoped the same way Lightweight sync's JQL is (`Ticket.currentSprintKey` + `labels in team.jiraLabels`), minus the per-person assignee clause. The Status view's roster and board are both derived client-side from this one list, grouped by `assigneeAccountId`.
- `useStatusView` (`packages/frontend/src/hooks/useStatusView.ts`) auto-selects the sprint (active, else first) and the roster's first person, mirroring `useSprintPlan`'s existing auto-select conventions, and always re-derives `tickets` from a GET after a sync rather than merging the sync response in place — same "single source of truth" convention `useSprintPlan.refreshPlan` already established.
- Skipped per this run's instructions: no Jira writes anywhere (this ticket only ever reads), and the code-review pass was skipped on request.
