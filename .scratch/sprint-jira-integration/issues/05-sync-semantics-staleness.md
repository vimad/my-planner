# Sync semantics & staleness

Type: grilling
Status: resolved
Blocked by: 01, 03

## Question

Map is [Sprint (Jira Integration) — Phase 1 Planning Map](../map.md).

Define exactly what each sync action does, given the map's asymmetry (Planning = manual per-ticket entry, Status view = auto-discovery per selected person) and that both are sprint-scoped:

- **Planning, single-ticket entry**: typing a ticket number fetches and caches that one ticket (+ its sub-tasks, epic if any). Confirm this is a single-issue fetch, not a search.
- **Planning, "sync" button**: does it re-fetch only tickets already entered into the current sprint's table, or does it also do anything broader? Confirm scope (likely: re-fetch all tickets currently in this team+sprint's plan).
- **Status view, per-person sync**: triggered for one selected person at a time to limit API calls — uses ticket 01's findings on JQL/bulk endpoints to fetch that person's tickets for the selected sprint, refreshing only status + title (not description/comments) per the map.
- **Status-set refresh**: when/how the locally-mirrored status set (ticket 03) gets updated as Jira's workflow statuses are observed during sync.
- **Staleness display**: confirm the last-synced timestamp is per-ticket (already decided) and decide where/how it renders (e.g. relative time on each row, a visual staleness threshold/highlight, or just the raw timestamp).
- Confirm phase 1 has no background/scheduled sync — everything is user-triggered, per the map's read-only scope.

Blocked by ticket 01 (need to know what bulk/JQL endpoints actually exist) and ticket 03 (the unified Ticket model this syncs into). Feeds into ticket 09 (Status view UI).

## Answer

- **Planning, single-ticket entry**: typing a ticket number does a Full sync of that ticket, then follows its `subtasks` refs and Full-syncs each sub-task too, in the same action — no separate step needed to pull in `[Dev]`/`[Test]` sub-tasks.
- **Planning, "sync" button**: Full sync (all fields) of every ticket already in that team+sprint's `SprintPlanEntry` list, plus their linked sub-tasks, batched via `POST /rest/api/3/issue/bulkfetch` (≤100 keys/call per ticket 01's findings).
- **Status view, per-person sync**: Lightweight sync via `GET/POST /rest/api/3/search/jql` with `assignee = <accountId> AND sprint = <sprintId> AND labels in (<teamLabel>)`, `fields=summary,status` — the label filter keeps the view scoped to this team's slice of that person's work. A ticket discovered only this way has all other `Ticket` fields `null` until some Full sync (e.g. via Planning) fills them in — accepted as fine for phase 1.
- **Status set refresh**: piggybacks on every sync action (Planning or Status-view) as a side effect — no dedicated button.
- **Staleness display**: relative-time rendering of each `Ticket.lastSyncedAt` (e.g. "Synced 2h ago", exact time on hover/tooltip) — no threshold-based visual warning for phase 1.
- No background/scheduled sync anywhere in phase 1 — every sync above is user-triggered.

Recorded in [CONTEXT.md](../../../CONTEXT.md) (Full sync, Lightweight sync).
