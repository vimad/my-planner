# Jira Cloud REST API integration surface

Type: research
Status: resolved

## Question

Map is [Sprint (Jira Integration) — Phase 1 Planning Map](../map.md).

Investigate the Jira Cloud REST API (`wealthos.atlassian.net`, project `WOSMVP`) to determine the concrete integration surface phase 1 will build against:

- **Auth**: confirm basic auth via email + API token works against the REST API (v3) for this instance and what scopes/permissions it needs.
- **Sprints**: how to list sprints for a board (e.g. `WOSMVP sprint 132`), including which are active/future/closed, via the Agile API (`/rest/agile/1.0/board/{boardId}/sprint`).
- **Boards**: how to resolve the board id(s) backing the shared `WOSMVP` backlog (e.g. `Odyssey` board seen in the UI).
- **Single-ticket fetch**: the endpoint/shape for fetching one issue by key (`WOSMVP-14782`) with fields needed: type, status, assignee (name+email/accountId), estimate/story points or time tracking, labels, epic link, parent/sub-task links, and the custom "Stream" field.
- **Field metadata**: how to discover the field id for a custom field like "Stream" (e.g. `/rest/api/3/field` or issue `editmeta`), since custom field ids are per-instance and not documented ahead of time.
- **Bulk/JQL search**: whether a JQL search endpoint (`/rest/api/3/search`) or bulk-fetch endpoint can pull all tickets for a given assignee + sprint in one call (for Status-view auto-discovery), and any endpoint that returns only status+title cheaply (avoiding full payload cost) for lightweight sync.
- **Rate limits**: any documented rate limits relevant to a manual "sync" button usage pattern (not polling).

Report findings as a reference doc (field ids, endpoint shapes, auth header format, example requests/responses) that later tickets (02, 03, 05) can build on.

## Answer

Full findings (endpoint shapes, example requests/responses, citations): [research/jira-api-integration-surface.md](../research/jira-api-integration-surface.md). All against Atlassian's official docs/OpenAPI specs — no credentials for the real instance, so instance-specific facts are flagged for live verification before implementation.

Key facts for later tickets:
- **Auth**: Basic auth (`email:api_token` base64) is fully supported on `/rest/api/3` and `/rest/agile/1.0`. Tokens now default to 1-year expiry (policy since Dec 2024) — phase 1 config/UI should surface the expiry so it doesn't fail silently a year in.
- **Boards/sprints**: `GET /rest/agile/1.0/board?projectKeyOrId=WOSMVP` resolves the board id; `GET /rest/agile/1.0/board/{boardId}/sprint?state=active,future,closed` lists/filters sprints — matches ticket 03's `Sprint.state` field directly.
- **Epic/parent linkage**: Jira Cloud's Epic Link → unified `parent` field migration is fully rolled out (completed Feb 2024). Build `Ticket.epicKey`/`Ticket.parentKey` (ticket 03) off `fields.parent` — no legacy Epic Link custom field lookup needed.
- **Assignee**: `accountId` is always present; `emailAddress`/`displayName` may be `null` per the assignee's privacy settings — confirms ticket 02's decision to key `Person` matching on `jiraAccountId`, not email.
- **"Stream" field discovery**: `GET /rest/api/3/field/search?query=Stream&type=custom` returns the real `customfield_XXXXX` id and confirms select (single) vs multiselect (array) shape — resolve once, cache the id in config, don't re-resolve every sync.
- **Search**: the legacy `/rest/api/3/search` endpoint is sunset (HTTP 410 on many instances already) — must use `POST/GET /rest/api/3/search/jql` (token-based `nextPageToken` pagination, not offset-based) for JQL discovery (e.g. assignee+sprint for Status-view auto-discovery), and `POST /rest/api/3/issue/bulkfetch` (≤100 keys/call) for refreshing a known set of tickets. This is the concrete mechanism ticket 05 (sync semantics) should design against.
- **Rate limits**: a manual sync-button click (tens of issues) costs on the order of 30–100 points against an hourly quota in the tens/hundreds of thousands — a non-issue; only worth handling `429`/`Retry-After` gracefully.

**Still needs live verification** (can't be resolved from docs alone — do this early in implementation, not later): real board id for "Odyssey"/WOSMVP; the actual `customfield_XXXXX` id and select-type for "Stream"; exact `subtasks` array shape on a real issue; whether `emailAddress`/`parent` are actually populated as expected on a real WOSMVP issue given this org's privacy settings; and a smoke test confirming `/search/jql` works on `wealthos.atlassian.net` specifically.

Findings were produced on a throwaway branch (`research/jira-api-integration-surface`) and merged into the main working tree; the branch can be deleted once this ticket is closed.
