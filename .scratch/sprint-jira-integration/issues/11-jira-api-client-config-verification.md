# 11 — Jira API client, config & live verification

**What to build:** A backend service wrapping Jira Cloud's REST API (Basic auth, board/sprint resolution, issue fetch/bulkfetch, JQL search, custom-field discovery, user search) that every later Jira-touching ticket builds on, plus the live, one-time verification of instance-specific facts the spec flags as unconfirmed. Backend-only, verified via mocked-request tests and a documented manual verification pass against the real `wealthos.atlassian.net` instance. See `.scratch/sprint-jira-integration/spec.md` ("Jira integration surface") for full context.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [x] `packages/backend/.env.example` gains `JIRA_BASE_URL`, `JIRA_EMAIL`, `JIRA_API_TOKEN`, matching the existing env-var convention (`MONGODB_URI`, `PORT`).
- [x] `packages/backend/src/services/jiraClient.ts` — a thin client sending Basic auth (`email:api_token` base64) against `/rest/agile/1.0` and `/rest/api/3`, with functions for:
  - `resolveBoard(projectKey)` — `GET /rest/agile/1.0/board?projectKeyOrId=`
  - `listSprints(boardId, states?)` — `GET /rest/agile/1.0/board/{boardId}/sprint?state=active,future,closed`
  - `bulkFetchIssues(keys: string[])` — `POST /rest/api/3/issue/bulkfetch`, chunked into batches of ≤100 keys
  - `searchJql(jql, fields)` — `POST /rest/api/3/search/jql`, following `nextPageToken` pagination until exhausted
  - `findCustomField(query)` — `GET /rest/api/3/field/search?query=&type=custom`
  - `searchUsers(query)` — `GET /rest/api/3/user/search?query=`, wrapped so a `403` (missing "Browse users and groups" permission) is caught and surfaced as "unavailable" rather than thrown
  - `429`/`Retry-After` handled with a single retry, not a backoff loop (rate limits are a non-issue at this usage volume per the spec).
- [x] Unit tests (mocked `fetch`) assert: the Basic auth header is sent correctly, `bulkFetchIssues` chunks >100 keys into multiple calls, `searchJql` follows `nextPageToken` across pages, and `searchUsers` degrades gracefully (returns `null`/empty, doesn't throw) on a `403`.
- [x] A documented manual verification step (e.g. a short script or README note under `packages/backend/`) that, run once against the real instance with a real token, records: the resolved board id for project `WOSMVP`; the `customfield_XXXXX` id and select-type for "Stream"; confirmation that `/search/jql` responds as expected on `wealthos.atlassian.net`; and whether the configured account has the "Browse users and groups" permission. These facts get hardcoded/configured wherever ticket 13 and ticket 17 need them — this ticket only needs to produce and record them, not consume them.

## Comments

**Scope confirmed with the user up front: read-only only.** No write/transition/comment/edit calls to Jira exist anywhere in `jiraClient.ts` or `verifyJira.ts` — every function is a `GET` or a read-only `POST` (search/bulkfetch). Noted explicitly in `packages/backend/README.md` so it stays visible to whoever runs the verification script later.

**Files added:** `packages/backend/src/services/jiraClient.ts` (client), `packages/backend/test/jiraClient.test.ts` (10 mocked-`fetch` unit tests), `packages/backend/src/scripts/verifyJira.ts` (live verification script), `packages/backend/README.md` (new — documents how to run the script and records the results). `.env.example` and `package.json` (`verify:jira` script) updated.

**Config resolution:** each exported function reads `JIRA_BASE_URL`/`JIRA_EMAIL`/`JIRA_API_TOKEN` from `process.env` on every call (via a local `getConfig()`) rather than caching a client instance at import time — consistent with how `server.ts` already reads its own env vars, and lets tests set `process.env` per-`beforeEach` without any module-reset gymnastics.

**Real-instance finding that changed the `resolveBoard` signature from the ticket's literal description:** `GET /rest/agile/1.0/board?projectKeyOrId=WOSMVP` alone does **not** uniquely resolve "the WOSMVP board" — the live instance returned 12 different boards scoped to project WOSMVP (most other teams' kanban/scrum boards sharing the same project), and `values[0]` happened to be an irrelevant kanban board ("TEST PIPELINE") that doesn't even support sprints. Added an optional second parameter, `resolveBoard(projectKey, name?)`, which adds Jira's own `name` filter to the same request — confirmed live that `projectKeyOrId=WOSMVP&name=Odyssey` cleanly isolates the one target board. `verifyJira.ts` calls `resolveBoard('WOSMVP', 'Odyssey')`.

**Live verification results (recorded in `packages/backend/README.md`, run 2026-08-10 against `wealthos.atlassian.net`):**
- Board id for `WOSMVP`/"Odyssey": **235** (type `scrum`).
- "Stream" custom field: **`customfield_10240`**, `schema.type: "option"` (confirmed single-select as the ticket premise assumed).
- `/search/jql`: responds correctly on this instance.
- "Browse users and groups" permission: **available** for this token's account (`user/search` returns real results, not a 403) — worth flagging for ticket 07/17's person-mapping flow, since the `user/search` autocomplete path doesn't need to fall back to manual-only entry.

**Verification commands run — all green:**
- `pnpm --filter backend test` → 14 files / 232 tests passed (was 231; +1 net test file, jiraClient.test.ts's 10 tests).
- `pnpm typecheck` → zero errors (backend + frontend).
- `pnpm --filter backend verify:jira` → ran live against `wealthos.atlassian.net`, output recorded above and in the README. No Jira data was created, edited, or deleted.
