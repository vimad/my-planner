# 11 — Jira API client, config & live verification

**What to build:** A backend service wrapping Jira Cloud's REST API (Basic auth, board/sprint resolution, issue fetch/bulkfetch, JQL search, custom-field discovery, user search) that every later Jira-touching ticket builds on, plus the live, one-time verification of instance-specific facts the spec flags as unconfirmed. Backend-only, verified via mocked-request tests and a documented manual verification pass against the real `wealthos.atlassian.net` instance. See `.scratch/sprint-jira-integration/spec.md` ("Jira integration surface") for full context.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] `packages/backend/.env.example` gains `JIRA_BASE_URL`, `JIRA_EMAIL`, `JIRA_API_TOKEN`, matching the existing env-var convention (`MONGODB_URI`, `PORT`).
- [ ] `packages/backend/src/services/jiraClient.ts` — a thin client sending Basic auth (`email:api_token` base64) against `/rest/agile/1.0` and `/rest/api/3`, with functions for:
  - `resolveBoard(projectKey)` — `GET /rest/agile/1.0/board?projectKeyOrId=`
  - `listSprints(boardId, states?)` — `GET /rest/agile/1.0/board/{boardId}/sprint?state=active,future,closed`
  - `bulkFetchIssues(keys: string[])` — `POST /rest/api/3/issue/bulkfetch`, chunked into batches of ≤100 keys
  - `searchJql(jql, fields)` — `POST /rest/api/3/search/jql`, following `nextPageToken` pagination until exhausted
  - `findCustomField(query)` — `GET /rest/api/3/field/search?query=&type=custom`
  - `searchUsers(query)` — `GET /rest/api/3/user/search?query=`, wrapped so a `403` (missing "Browse users and groups" permission) is caught and surfaced as "unavailable" rather than thrown
  - `429`/`Retry-After` handled with a single retry, not a backoff loop (rate limits are a non-issue at this usage volume per the spec).
- [ ] Unit tests (mocked `fetch`) assert: the Basic auth header is sent correctly, `bulkFetchIssues` chunks >100 keys into multiple calls, `searchJql` follows `nextPageToken` across pages, and `searchUsers` degrades gracefully (returns `null`/empty, doesn't throw) on a `403`.
- [ ] A documented manual verification step (e.g. a short script or README note under `packages/backend/`) that, run once against the real instance with a real token, records: the resolved board id for project `WOSMVP`; the `customfield_XXXXX` id and select-type for "Stream"; confirmation that `/search/jql` responds as expected on `wealthos.atlassian.net`; and whether the configured account has the "Browse users and groups" permission. These facts get hardcoded/configured wherever ticket 13 and ticket 17 need them — this ticket only needs to produce and record them, not consume them.
