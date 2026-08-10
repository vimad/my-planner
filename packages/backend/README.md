# backend

Express + Mongoose API for my-planner. See the root README for setup/run instructions.

## Jira integration — live verification

`src/services/jiraClient.ts` is a thin, read-only wrapper over Jira Cloud's REST API (Basic auth). It's covered by mocked-`fetch` unit tests (`test/jiraClient.test.ts`), but a few instance-specific facts about `wealthos.atlassian.net` can only be confirmed by calling the real API once. That's what `src/scripts/verifyJira.ts` does.

**Never writes to Jira** — every call it makes is a `GET`/read-only `POST` (search, bulkfetch) against Jira's REST API. Nothing in this script or `jiraClient.ts` creates, edits, transitions, or deletes a Jira issue.

### Running it

1. Add `JIRA_BASE_URL`, `JIRA_EMAIL`, `JIRA_API_TOKEN` to `packages/backend/.env` (see `.env.example`).
2. `pnpm --filter backend verify:jira`

It prints the board id, sprint count, the "Stream" custom field's id/schema, a `/search/jql` smoke-test result, and whether the token's account has the "Browse users and groups" permission — no secrets are printed.

### Recorded results

_Recorded 2026-08-10, run against `wealthos.atlassian.net`:_

- Board id for project `WOSMVP`: **235** ("Odyssey", type `scrum`). Note: `WOSMVP` has 12 boards total (most other teams' kanban/scrum boards over the same project) — `projectKeyOrId` alone is **not** enough to identify the right one; `resolveBoard` takes an optional `name` filter for this reason and callers targeting Odyssey must pass `'Odyssey'`.
- `customfield_XXXXX` id and select-type for "Stream": **`customfield_10240`**, `schema.type: "option"` (single-select, as assumed), `schema.custom: "...customfieldtypes:select"`.
- `/search/jql` responds as expected: yes — confirmed working on this instance.
- "Browse users and groups" permission available: **yes** — `user/search` returned results for this token's account (not just a 403-degrade path).

_Recorded 2026-08-10, additional facts gathered during ticket 13's implementation (`src/services/ticketSync.ts`) via one-off read-only calls against real WOSMVP issues — not scripted into `verifyJira.ts` since they're consumed once, at code-time, rather than needed on every run:_

- "Sprint" custom field id: **`customfield_10020`** (`schema.custom: "com.pyxis.greenhopper.jira:gh-sprint"`, type `array`). Value is a list of every sprint the issue was ever in, oldest first — the *current* sprint is the last entry, not necessarily the only one with `state: "active"` (a carried-over ticket lists its past closed sprints too). `Ticket.currentSprintKey` takes that last entry's `id`.
- Estimate field: no dedicated "Story Points" field is used on WOSMVP in a way confirmed populated; used the system `timeoriginalestimate` field instead (seconds, flat numeric — always present when Jira's time-tracking feature is on, which it is on this instance), converted to hours for `Ticket.estimateHours`. (`customfield_10016`/`10024` exist as "Story point estimate"/"Story Points" but weren't adopted — see CONTEXT.md's Effort/Estimate distinction for why hours, not points, is what phase 1 needs.)
- `fields.parent` on a real sub-task (`WOSMVP-15059`, parent `WOSMVP-15058`, a Story) vs. a real epic-child (`WOSMVP-15058`, parent `WOSMVP-8262`, an Epic): both populated as documented, and critically both carry a nested `fields.issuetype.name` on the parent ref — this is what `mapIssueToTicketFields` uses to tell "sub-task's parent" (→ `Ticket.parentKey`) apart from "epic-child's parent" (→ `Ticket.epicKey`) without a second fetch.
- `fields.subtasks` shape confirmed as documented: `{id, key, self, fields: {summary, status, priority, issuetype}}`.
- Sub-task title prefix convention confirmed live, e.g. `"[Dev]Beneficiary leaver inclusion in FPS"` / `"[Test]Beneficiary leaver inclusion in FPS"` (no space after the bracket).
