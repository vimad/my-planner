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
