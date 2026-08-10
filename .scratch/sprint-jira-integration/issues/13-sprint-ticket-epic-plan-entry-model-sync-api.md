# 13 — Sprint, Ticket, Epic & SprintPlanEntry: models + Full sync + Planning API

**What to build:** The unified `Ticket` cache and the Planning view's backend surface — models, the Full-sync flow (single ticket + its sub-tasks, and whole-plan resync), and the endpoints the Planning view (ticket 18) and Epics strip (ticket 20) consume. Backend-only, verified via API tests with `jiraClient` (ticket 11) mocked. See `.scratch/sprint-jira-integration/spec.md` ("Domain model — Sprint, Ticket, Epic, Status", "Sprint Plan Entry", "Sync semantics & staleness").

**Blocked by:** 11 — Jira API client, config & live verification; 12 — Team, Person & TeamMembership: models + CRUD API.

**Status:** ready-for-agent

- [x] `packages/backend/src/models/Sprint.ts`: `jiraSprintId`, `name`, `state: 'active' | 'future' | 'closed'`, `startDate: Date | null`, `endDate: Date | null`, `lastSyncedAt`.
- [x] `packages/backend/src/models/Ticket.ts` — the one representation shared unmodified across Planning, Status, and Epic views: `jiraKey` (full key, unique), `type`, `title`, `status`, `assigneeAccountId: string | null`, `estimateHours: number | null`, `labels: string[]`, `stream: string | null`, `epicKey: string | null`, `parentKey: string | null`, `subtaskKind: 'Dev' | 'Test' | null` (parsed from the `[Dev]`/`[Test]` title prefix at sync time), `currentSprintKey: string | null`, `lastSyncedAt`. Also `assigneeDisplayName: string | null` and `assigneeEmail: string | null` — display-only fields captured straight from the Jira response at sync time (not used for matching, which stays strictly `accountId` per ADR 0001), added specifically so ticket 22's "promote unmapped assignee" flow has something to pre-fill besides a bare accountId.
- [x] An `Effort` helper (not a stored field): sum of a ticket's sub-tasks' `estimateHours` (queried via `parentKey`) if any exist, else the ticket's own `estimateHours`.
- [x] `packages/backend/src/models/Epic.ts`: `jiraKey` (unique), `title`, `status`, `lastSyncedAt`. Child-ticket rollup (count, progress) computed by querying `Ticket.epicKey` — never stored.
- [x] `packages/backend/src/models/SprintPlanEntry.ts`: `teamId`, `sprintId`, `ticketId` (refs), `addedAt`, `order: number` — per-assignee drag order (ticket 10's resolution): meaningful only relative to other entries sharing this ticket's *current* assignee; not a global order. Unique compound index on `(teamId, sprintId, ticketId)`.
- [x] `packages/backend/src/routes/sprints.ts`: `GET /api/sprints?teamId=` — resolves the team's board (via `jiraClient.resolveBoard`, using the team's `jiraLabels`-implied project) and lists/caches its sprints.
- [x] `packages/backend/src/routes/sprintPlanEntries.ts`:
  - `POST /api/sprint-plan-entries` — body `{ teamId, sprintId, jiraKey }`. Full sync (via `jiraClient.bulkFetchIssues`) of that ticket, then its sub-tasks in the same call, upserting `Ticket` docs; creates the `SprintPlanEntry` with `order` set to the end of that assignee's current row.
  - `GET /api/sprint-plan-entries?teamId=&sprintId=` — lists the plan with `Ticket` populated, grouped-by-assignee left to the client.
  - `POST /api/sprint-plan-entries/sync` — body `{ teamId, sprintId }`. Full sync (bulkfetch, ≤100 keys/call) of every ticket already in that plan plus their sub-tasks.
  - `PATCH /api/sprint-plan-entries/:id` — body `{ order }`. Drag-reorder save-on-drop (ticket 19 is the UI consumer).
  - Reassignment handling: whenever a Full sync updates a `Ticket.assigneeAccountId` to a different person than before, any `SprintPlanEntry` referencing it gets its `order` reset to `max(order) + 1` among that new assignee's current entries in the same team+sprint.
- [x] `packages/backend/src/routes/epics.ts`: `GET /api/epics?sprintId=` — active epics for a sprint with child-ticket rollup, sourced from `Ticket.epicKey`.
- [x] Backend tests cover: single-ticket Full sync creating the parent + sub-task `Ticket` docs, the whole-plan sync endpoint batching correctly, Effort computation (zero/one/two+ sub-tasks), the reassignment-resets-order behavior, the `order` PATCH endpoint, and the epic rollup query.

## Comments

**Bug found and fixed while building ticket 20 (epics pill strip):** `fullSyncTickets` (`services/ticketSync.ts`) never actually followed a synced ticket's epic — it upserted `Ticket` docs (`epicKey` included) but nothing ever wrote to the `Epic` collection, so `GET /api/epics`'s `Epic.find({ jiraKey: { $in: epicKeys } })` always returned `[]`. Net effect: the epics strip stayed empty for real usage even when synced tickets had a valid `epicKey`, since only the sibling ticket that's actually planned gets synced — untouched siblings never get a `Ticket` doc at all, which is fine/expected (rollup is phase-1-accepted to only count synced siblings), but the *epic itself* not existing meant the whole epic silently never appeared regardless of how many siblings were synced.

Fixed in `fullSyncTickets`: after upserting every synced ticket, it now also bulk-fetches the distinct `epicKey`s among them and upserts `title`/`status`/`lastSyncedAt` onto an `Epic` doc per key — matching this ticket's own spec quote ("single-ticket entry: fetches and caches that one ticket (+ its sub-tasks, epic if any)") which the original implementation missed. Covered by three new tests in `test/ticketSync.test.ts`.
