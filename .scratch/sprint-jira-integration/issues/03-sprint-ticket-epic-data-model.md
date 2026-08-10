# Sprint, Ticket, Sub-task & Epic data model

Type: grilling
Status: resolved

## Question

Map is [Sprint (Jira Integration) — Phase 1 Planning Map](../map.md).

Pin down the data model for cached Jira data, honoring the map's "exactly one unified `Ticket` concept, no per-view duplication" principle:

- `Sprint`: cached from Jira (id, name like "WOSMVP sprint 132", state, start/end dates). Multiple sprints stored so planning can happen across sprints.
- `Ticket`: unified entity covering Bug/Story/Task/Sub-task, used by both Planning and Status views and epic drill-down. Fields: Jira key (store just the numeric suffix per the map, or full key — decide), type, status (see status-set note below), assignee (→ `Person`, plus the unmapped-assignee case from ticket 02), estimate (format — the spreadsheet mixes days/hours like "4d1h"; decide internal storage unit and display formatting), labels, "Stream" custom field value, epic link, parent link (for sub-tasks), last-synced timestamp.
- Sub-task handling: Story/Bug normally have `[Dev]` and `[Test]` sub-tasks each with their own estimate — decide how "total effort" is computed/displayed for a parent ticket (sum of sub-task estimates vs. the parent's own estimate field, and what happens when a story has zero, one, or more than two sub-tasks).
- `Epic`: key, title, status, and enough of a child-ticket rollup to support the simple list + click-through detail view (already scoped — see map Notes).
- Status set: decide how the locally-mirrored status set is populated/kept in sync (e.g. derived from observed ticket statuses on sync, vs. fetched from the board's workflow configuration) given "Jira is always the source of truth."
- Confirm whether "Stream" and labels are stored as free-form strings/arrays or need their own lookup collections.

Not blocked — can start immediately alongside ticket 02. Ticket 01's field-id findings will inform the Jira→local field mapping but shouldn't change the shape decided here. Tickets 04, 05, 08, 09 depend on this ticket's outcome.

## Answer

Converged on the following schema (Mongoose/MongoDB, matching this repo's flat one-file-per-model house style):

**Sprint** — `jiraSprintId`, `name` (e.g. "WOSMVP sprint 132"), `state: 'active' | 'future' | 'closed'`, `startDate: Date | null`, `endDate: Date | null`, `lastSyncedAt: Date`.

**Ticket** (unified across Bug/Story/Task/Sub-task — the single representation used by Planning, Status, and Epic views):
- `jiraKey: string` (full key e.g. `"WOSMVP-14782"`, unique) — chosen over storing just the numeric suffix so the model stays self-describing; UI strips the `WOSMVP-` prefix for display/entry per the spreadsheet convention.
- `type`, `title`, `status: string` (matches a `Status.name`)
- `assigneeAccountId: string | null` — matched against `Person.jiraAccountId` (ADR 0001); no assignee match found is a pure display-time "unmapped" computation, never stored.
- `estimateHours: number | null` — raw Jira value, stored as-is even when sub-tasks also carry estimates.
- **Effort** (computed, never stored): sum of child sub-tasks' `estimateHours` if the ticket has any (queried via `parentKey`), otherwise the ticket's own `estimateHours`. This is what capacity math (ticket 04) uses.
- `labels: string[]`, `stream: string | null` — plain fields, no separate lookup collections.
- `epicKey: string | null`, `parentKey: string | null` (sub-task → parent ticket).
- `subtaskKind: 'Dev' | 'Test' | null` — parsed from the `[Dev]`/`[Test]` title prefix at sync time.
- `currentSprintKey: string | null` — snapshot of whatever Jira currently reports as the ticket's sprint; used only for Status-view auto-discovery matching, kept separate from planning history (see `SprintPlanEntry` below and [ADR 0002](../../../docs/adr/0002-separate-sprint-plan-entry-from-ticket.md)).
- `lastSyncedAt: Date`.

**Epic** — `jiraKey` (unique), `title`, `status`, `lastSyncedAt`. Child-ticket rollup (count, progress) is always computed by querying `Ticket.epicKey` — never stored on the Epic doc.

**Status** — `name` (unique), `order: number`, `category: 'todo' | 'in_progress' | 'done'`, `lastSyncedAt`. Refreshed wholesale from the Jira board's column configuration on every sync so the Status view's columns mirror the real board; never hand-edited.

**SprintPlanEntry** (join: Team × Sprint × Ticket) — `teamId` (ref Team), `sprintId` (ref Sprint), `ticketId` (ref Ticket), `addedAt: Date`; unique compound index on `(teamId, sprintId, ticketId)`. Created the moment a ticket number is typed into a specific team+sprint's Planning table — the historical record of what was planned when, decoupled from `Ticket.currentSprintKey` so carry-over tickets keep appearing in every sprint's plan they were ever added to. See [ADR 0002](../../../docs/adr/0002-separate-sprint-plan-entry-from-ticket.md).

Recorded in [CONTEXT.md](../../../CONTEXT.md) (Ticket, Effort, Sub-task kind, Epic, Status, Sprint Plan Entry) and [ADR 0002](../../../docs/adr/0002-separate-sprint-plan-entry-from-ticket.md).
