# 01 — Backlog browse endpoint

**What to build:** A read-only, uncached `GET /api/tickets/backlog` endpoint that lists a team's Jira backlog — Technical/Product/Bugs categories, each a live query against a named sprint on the Product Delivery Board, scoped to the team's `jiraLabels`. Backend-only, no UI, verified via API calls and tests. See `.scratch/add-from-backlog/spec.md` for full context.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] Two new named-sprint constants — **Tech and Ops Backlog** (Technical category), **Product Backlog** (Product category), **Bug Backlog** (Bugs category) — resolved on the existing `FUTURE_SPRINTS_BOARD_NAME` ("Product Delivery Board") board, the same way `sprintSync.ts`'s `searchJiraSprints()` already resolves that board and matches a sprint by exact name within `listSprints(boardId)`.
- [ ] New service function(s), alongside `services/sprintSync.ts`/`jiraClient.ts`, that: given a `teamId` and a category, resolve that category's sprint id on the Product Delivery Board, build a JQL query scoping to that sprint id **and** `labels in (...)` against the requesting `Team.jiraLabels`, and run it through the existing `searchJql()` (paginated), the same way `lightweightSyncTickets` already builds and runs its own JQL.
- [ ] For each Story/Bug result, resolve Dev/QA by reusing the existing `[Dev]`/`[Test]` title-prefix Sub-task parsing (`ticketSync.ts`'s `mapIssueToTicketFields`/subtask handling) — read-only here, never written to `Ticket`/`TicketDevQaOverride`. A Task result reads its plain `assigneeAccountId`/display name directly, no Sub-task lookup.
- [ ] `GET /api/tickets/backlog?teamId=&category=tech-ops|product|bug&q=` route (new file, or added to an existing tickets-adjacent route file): validates `category` against the three known values, applies an optional `q` server- or route-layer substring filter on key/title, and returns a flat list:
  ```
  { key, title, type, labels, dev: { name } | null, qa: { name } | null, assignee: { name } | null }
  ```
- [ ] An empty `Team.jiraLabels` returns an empty list for every category (the `labels in ()` clause matches nothing) — not a 4xx/5xx.
- [ ] Nothing about this endpoint writes to `Ticket`, `TicketDevQaOverride`, `TicketAssigneeOverride`, or any other collection — confirm with a test that asserts no persistence side effect.
- [ ] Backend tests (new file alongside `routes/tickets.test.ts`), mocking `jiraClient`'s `resolveBoard`/`listSprints`/`searchJql`/`bulkFetchIssues` the same way `sprintSync.test.ts`/`ticketSync.test.ts` already do:
  - JQL built with the correct sprint id + `labels in (...)` clause per category.
  - Story/Bug rows resolve Dev/QA from `[Dev]`/`[Test]` Sub-tasks the same way a Full sync would.
  - A Task row uses its plain assignee.
  - Empty `Team.jiraLabels` returns an empty list per category, no error.
  - No write/persistence side effect from calling the endpoint.
