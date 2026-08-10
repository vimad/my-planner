# Jira Cloud REST API integration surface — research findings

Scope: `wealthos.atlassian.net`, project key `WOSMVP` (e.g. `WOSMVP-14782`), board seen in the UI as "Odyssey". Goal: determine the concrete read-only integration surface a future phase-1 sync feature would build against.

**Primary sources used**: the human-readable Atlassian developer docs pages, plus the machine-readable OpenAPI specs that generate them (`https://dac-static.atlassian.com/cloud/jira/platform/swagger-v3.v3.json` for platform/v3 APIs, `https://dac-static.atlassian.com/cloud/jira/software/swagger.v3.json` for the Agile/`rest/agile/1.0` APIs — these URLs are linked directly from the corresponding `developer.atlassian.com/cloud/jira/.../rest/...` pages and are the actual spec source for them, so I'm treating them as first-party/primary, not a secondary write-up). Community/support articles are cited only for deprecation timelines and are marked as such.

**Everything below is unauthenticated desk research.** I have no credentials for `wealthos.atlassian.net`. Every section ends with an explicit "Needs live verification" note for instance-specific facts (board id, actual field ids, whether the project is company-managed vs. team-managed, whether legacy Epic Link still returns data, etc.).

---

## 1. Auth

**Basic auth with email + API token works for both `/rest/api/2` and `/rest/api/3`.** Source: [Basic auth for REST APIs](https://developer.atlassian.com/cloud/jira/platform/basic-auth-for-rest-apis/).

- Password auth is deprecated; API tokens are the only supported credential for Basic auth now.
- Header construction: base64-encode `email:api_token`, send as `Authorization: Basic <encoded>`.
  ```
  curl -D- \
     -u fred@example.com:freds_api_token \
     -X GET \
     -H "Content-Type: application/json" \
     https://your-domain.atlassian.net/rest/api/2/issue/createmeta
  ```
  or manually:
  ```
  curl -D- \
     -X GET \
     -H "Authorization: Basic ZnJlZDpmcmVk" \
     -H "Content-Type: application/json" \
     "https://your-domain.atlassian.net/rest/api/2/issue/QA-31"
  ```
- Jira Cloud allows anonymous access, so there's no `WWW-Authenticate` challenge — the client must proactively send the header rather than retry-on-401.
- Repeated failed attempts can trigger a CAPTCHA that blocks further API calls until solved in a browser.
- Every v3 endpoint I inspected (`issue/{id}`, `search/jql`, `field`) declares `security: [{basicAuth: []}, {OAuth2: [...]}, {}]` in its OpenAPI operation — i.e. Basic auth is explicitly a supported first-class auth mode for these read endpoints, not just OAuth. The trailing `{}` on read/search/browse endpoints also means **anonymous access is possible if the instance permits it** (irrelevant here since a private instance will require auth).

**API tokens (creation & lifecycle)**: [Manage API tokens](https://support.atlassian.com/atlassian-account/docs/manage-api-tokens-for-your-atlassian-account/), created at `https://id.atlassian.com/manage-profile/security/api-tokens`.

- **Since Dec 15, 2024, new tokens default to 1-year expiry**, and pre-existing tokens created before that date were migrated to expire within a year starting Mar 13, 2025. Expiry is configurable 1–365 days at creation.
- Atlassian now also offers **scoped API tokens** (narrower permission grants, e.g. Jira-only read scopes) as the recommended option over legacy unscoped tokens; scoped tokens call dedicated endpoints rather than the direct product REST base.
- **Design implication for a "sync button" feature**: whatever token is configured will need manual rotation at least yearly — worth a "token expires on X" note somewhere in phase-1 UI/config rather than a silent failure later.

**Scopes/permissions needed for read-only access**: there's no separate "read-only API scope" concept for Basic auth — Basic auth acts with the full permission set of the authenticating user's Jira account (whatever *Browse projects* / board permissions that human already has). The OAuth2 scope strings documented alongside each endpoint (relevant if a future phase uses OAuth 2.0 (3LO) instead of Basic auth) are:
  - `read:jira-work` — issue GET, JQL search (`/rest/api/3/search/jql`), field GET
  - `read:board-scope:jira-software` + `read:project:jira` — board GET (`/rest/agile/1.0/board`) (this exact pair was set as the *new* required scope combo per a **Feb 15, 2024** OAuth scope migration noted directly in the `getAllBoards` operation description — already in effect as of today)
  - `read:sprint:jira-software` — sprint GET (`/rest/agile/1.0/sprint/{sprintId}`, and `/rest/agile/1.0/board/{boardId}/sprint`)

For a personal single-user API-token integration (this project's pattern, matching how the rest of my-planner has no accounts/auth), Basic auth + a **Browse projects** permission on WOSMVP is all that's structurally required — no admin/write permission needed for phase 1's read-only scope.

**Needs live verification**: confirm the `wealthos.atlassian.net` account intended for the token actually has *Browse projects* permission on WOSMVP and Jira Software board-view access (not just Jira Service Management or a restricted role).

---

## 2. Sprints (Agile API)

### List sprints for a board
`GET /rest/agile/1.0/board/{boardId}/sprint` — documented under the **Board** operation group despite living conceptually with sprints: [`api-group-board`](https://developer.atlassian.com/cloud/jira/software/rest/api-group-board/#api-rest-agile-1-0-board-boardid-sprint-get) (operationId `getAllSprints`).

Parameters:
- `startAt`, `maxResults` — standard pagination.
- `state` — **filters by `future`, `active`, `closed`**, comma-separated for multiple, e.g. `state=active,closed`. This directly answers the "how to filter by active/future/closed" question.

Example response (verbatim from the OpenAPI spec):
```json
{
  "isLast": false,
  "maxResults": 2,
  "startAt": 1,
  "total": 5,
  "values": [
    {
      "id": 37,
      "self": "https://your-domain.atlassian.net/rest/agile/1.0/sprint/23",
      "state": "closed",
      "name": "sprint 1",
      "startDate": "2015-04-11T15:22:00.000+10:00",
      "endDate": "2015-04-20T01:22:00.000+10:00",
      "completeDate": "2015-04-20T11:04:00.000+10:00",
      "originBoardId": 5,
      "goal": "sprint 1 goal"
    },
    {
      "id": 72,
      "self": "https://your-domain.atlassian.net/rest/agile/1.0/sprint/73",
      "state": "future",
      "name": "sprint 2",
      "goal": "sprint 2 goal"
    }
  ]
}
```
Response is ordered "first by state (closed, active, future) then by their position in the backlog." Auth: `basicAuth` or OAuth2 `read:sprint:jira-software`. Errors: 403 if the calling user doesn't have a valid Jira Software license; 404 if the board doesn't exist or isn't visible to the user.

Note `originBoardId` — a sprint can be surfaced on more than one board, but `originBoardId` identifies where it was created; worth using as the canonical board reference if a future feature needs to disambiguate.

### Resolve a board id from a name (e.g. "Odyssey")
`GET /rest/agile/1.0/board?name=<query>` — [`api-group-board`](https://developer.atlassian.com/cloud/jira/software/rest/api-group-board/#api-rest-agile-1-0-board-get) (operationId `getAllBoards`).

- `name` does a **partial/substring match**, not exact match — a filter like `name=Odyssey` should work but could return more than one board if names overlap; the caller should also cross-check `values[].location.projectKey == "WOSMVP"` (see below) to disambiguate.
- Other useful filters: `projectKeyOrId` (filter boards relevant to WOSMVP directly — likely a cleaner primary lookup than by name), `type` (`scrum`/`kanban`/`simple`).
- Example response:
  ```json
  {
    "isLast": false, "maxResults": 2, "startAt": 1, "total": 5,
    "values": [
      {"id": 84, "name": "scrum board", "self": "https://your-domain.atlassian.net/rest/agile/1.0/board/84", "type": "scrum"}
    ]
  }
  ```
- Board's `location` sub-object (`BoardLocationBean` in the spec) carries `projectId`, `projectKey`, `projectName`, `displayName` — confirms which project a board is scoped to, useful to validate the resolved board actually belongs to WOSMVP.
- **Deprecation note found directly in the operation description**: "The required OAuth 2.0 scopes will be updated on February 15, 2024" to `read:board-scope:jira-software` + `read:project:jira` — that date has passed, so this is just the current state, not a future concern (only relevant if this feature ever moves off Basic auth onto OAuth).

**Needs live verification**: run `GET /rest/agile/1.0/board?name=Odyssey&projectKeyOrId=WOSMVP` (or without the project filter first) against the real instance to get the concrete board id backing WOSMVP's board — this cannot be predicted from docs.

### Issues in a sprint (bonus, may be useful for phase 1's board/sprint contents view)
`GET /rest/agile/1.0/sprint/{sprintId}/issue` is **deprecated** per the spec (`"deprecated": true` on the operation) though still present; supports a `jql` refinement param (**cannot use `username`/`userkey`** — must use `accountId`) and a `fields` param to control payload size. Given it's marked deprecated, prefer driving sprint-contents lookups via `/rest/api/3/search/jql` with `sprint = <id>` in the JQL instead (see §5) — same data, non-deprecated endpoint.

---

## 3. Single-issue fetch

`GET /rest/api/3/issue/{issueIdOrKey}` — [`api-group-issues`](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issues/#api-rest-api-3-issue-issueidorkey-get).

Key query params: `fields` (comma-separated allow-list, `*all`/`*navigable`/specific names, `-field` to exclude), `fieldsByKeys`, `expand`, `properties`. Auth: `basicAuth` or OAuth2 `read:jira-work`; can technically be called anonymously if the instance permits (won't apply here).

Important structural fact: in the OpenAPI schema, `IssueBean.fields` is typed as a fully dynamic object (`additionalProperties: {}` — literally "any shape"), because the field set is per-instance/per-issue-type-configuration. That's *why* custom field ids can't be predicted from static docs (see §4) and why well-known field shapes are documented only via prose + non-exhaustive examples rather than a strict schema. Concretely, from spec examples and schema fragments:

- **`issuetype` / `status`**: standard reference objects, `{id, name, ...}` shape (`IssueTypeDetails` / `StatusDetails` schemas) — not captured in a full worked example in the fetched spec excerpt; low risk, these are the most stable/well-known fields in all of Jira's history.
- **`assignee`** — a `User` object:
  ```json
  {
    "accountId": "5b10a2844c20165700ede21g",
    "accountType": "atlassian",
    "active": true,
    "displayName": "Mia Krystof",
    "emailAddress": "mia@example.com",
    "avatarUrls": { "16x16": "...", "24x24": "...", "32x32": "...", "48x48": "..." },
    "self": "https://your-domain.atlassian.net/rest/api/3/user?accountId=5b10a2844c20165700ede21g",
    "timeZone": "Australia/Sydney"
  }
  ```
  **GDPR/privacy caveat, straight from the `User` schema description**: "A user with details as permitted by the user's Atlassian Account privacy settings" — and specifically for `emailAddress`: *"Depending on the user's privacy setting, this may be returned as null."* Same caveat applies to `displayName`. `accountId` is the only field guaranteed stable and non-null for an active account; username/user-key are gone entirely (GDPR-era removal, per [User privacy developer guide](https://developer.atlassian.com/cloud/jira/platform/user-privacy-developer-guide/), which states `accountId` "uniquely identifies a user across all Atlassian products" and must be used instead of legacy identifiers for anything involving personal-data handling). **Practical implication: don't rely on `emailAddress` being populated** — if the sync needs to match a Jira assignee to a my-planner "Person" record, prefer accountId as the durable key and treat email as a best-effort convenience field that may be `null`.
- **`labels`**: standard system field, plain array of strings (well-established/stable Jira field; not separately re-verified with a fresh worked example in this pass — low-risk to assume `["label-a", "label-b"]`).
- **`timetracking`** (only present if the *time tracking* global feature is enabled — the `field` GET docs explicitly say fields "that depend on global Jira settings are only returned if the setting is enabled. That is, timetracking fields, subtasks, votes, and watches"):
  ```json
  {
    "originalEstimate": "10m",
    "originalEstimateSeconds": 600,
    "remainingEstimate": "3m",
    "remainingEstimateSeconds": 200,
    "timeSpent": "6m",
    "timeSpentSeconds": 400
  }
  ```
  There are also separate flat fields `timeoriginalestimate`/`timeestimate`/`timespent` (seconds, numeric) mirroring the same data outside the nested object — either can be requested via `fields=`. **Story points are not a system field at all** — on almost every real Jira Cloud instance "Story Points" is itself a custom field (commonly, but not reliably, `customfield_10016`) — it must be discovered the same way as "Stream" (§4), not assumed.
- **`subtasks`**: documented informally elsewhere in Atlassian's Jira Cloud docs as an array of simplified issue refs (`{id, key, self, fields: {summary, status, priority, issuetype}}`), but I could not pull a verbatim example of this exact field from the primary OpenAPI spec in this pass (the spec's dynamic-object typing for `fields` means this shape lives only in prose docs I didn't get a clean fetch of). **Flagging as needs live verification** — fetch one real WOSMVP parent issue with subtasks and inspect the actual `subtasks` array shape before coding against it.
- **`issuelinks`** (for context, since it's easy to confuse with subtasks): array of `{id, type: {id, name, inward, outward}, outwardIssue|inwardIssue: {id, key, self, fields: {status: {...}}}}` — this is the *generic issue-link* shape (e.g. "Dependent"/"Blocks"), distinct from `subtasks`.

### Parent / epic relationship — "parent" field vs. legacy Epic Link
This is a real, documented model change, not speculation:

- **Legacy model (company-managed/"classic" projects)**: Epic-to-issue association lived in a custom field called **Epic Link** (commonly `customfield_10014` on many instances, but per-instance like any custom field) plus a companion **`epic`** field object (name/color/status) and a separate **Parent Link** custom field (commonly `customfield_10018`) used for other hierarchy. Source: [Deprecation of the Epic Link, Parent Link and other related fields in REST APIs and webhooks](https://community.developer.atlassian.com/t/deprecation-of-the-epic-link-parent-link-and-other-related-fields-in-rest-apis-and-webhooks/54048) (Atlassian developer community, official Jira Cloud Announcements category) — deprecation window stated as **Nov 30, 2021 – Nov 30, 2022**, after which "the old behavior may be switched off."
- **Current/unified model**: a single **`parent` field** on the issue, used uniformly across company-managed and team-managed projects for both "sub-task's parent" and "epic child's parent epic":
  ```json
  "parent": { "id": "10097", "key": "ABC-1", "self": "https://{your_jira_site}.com/rest/api/3/issue/10097" }
  ```
  Rollout confirmation (official Atlassian article, redirected from `support.atlassian.com/jira-software-cloud/docs/upcoming-changes-epic-link-replaced-with-parent/`): [Introducing the new Parent field in company-managed projects](https://community.atlassian.com/forums/Jira-articles/Introducing-the-new-Parent-field-in-company-managed-projects/ba-p/2377758) — states the rollout "has been rolled out to all customers" (dated Jan 18, 2024; final "Bundled Track" cohort completed Feb 13, 2024). It also confirms the JQL `parent` function has absorbed `epic link`/`parent link`/`parentEpic` — old JQL using those functions still runs, but "you'll no longer be able to use them in new searches."
  - The `IssueTypeDetails.hierarchyLevel` field (`-1` subtask, `0` base, `1` epic — confirmed directly in the platform OpenAPI schema) is the modern, instance-agnostic way to know an issue type's place in the hierarchy, replacing the old boolean `subtype` flag (its own field description literally says: *"Deprecated. Use `hierarchyLevel` instead."*, linking the same community deprecation notice above).

**Practical guidance for phase 1**: read `fields.parent` as the primary epic/parent signal (works for both sub-task-of-story and story-of-epic cases, per the unified model, rollout-complete as of 2024). Only fall back to a legacy Epic Link custom field if `parent` is absent on an issue **and** WOSMVP turns out to be an older/non-migrated company-managed project — but per the official rollout note this should no longer happen on any Cloud instance today (Aug 2026).

**Needs live verification**: fetch a real epic-child issue (e.g. one under whatever epic contains WOSMVP-14782, if it has one) and confirm `fields.parent` is populated as documented, and separately confirm whether a legacy `customfield_100XX` Epic Link still appears at all (harmless if so — just extra data to ignore).

---

## 4. Custom field discovery ("Stream" field)

Two options, both under [`api-group-issue-fields`](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issues/):

### `GET /rest/api/3/field`
Returns **all** system + custom fields the user can see, unfiltered/unpaginated flat array:
```json
[
  {"clauseNames":["description"],"custom":false,"id":"description","name":"Description","navigable":true,"orderable":true,"schema":{"system":"description","type":"string"},"searchable":true},
  {"clauseNames":["summary"],"custom":false,"id":"summary","key":"summary","name":"Summary","navigable":true,"orderable":true,"schema":{"system":"summary","type":"string"},"searchable":true}
]
```
No permission required beyond project Browse (documented as "Permissions required: None" at the operation level, since it filters to what the caller can see project-by-project).

### `GET /rest/api/3/field/search` (better fit for "find the field named Stream")
Paginated, filterable version — exactly matches the use case:
- `query` — case-insensitive partial match on field name/description (e.g. `query=Stream`)
- `type=custom` — restrict to custom fields only
- `id` — filter to specific known field ids

Example response, notably showing exactly the "select-type custom field" shape "Stream" will have:
```json
{
  "isLast": false, "maxResults": 50, "startAt": 0, "total": 2,
  "values": [
    {
      "id": "customfield_10001",
      "name": "Change reason",
      "key": "customfield_10001",
      "schema": {
        "custom": "com.atlassian.jira.plugin.system.customfieldtypes:select",
        "customId": 10001,
        "type": "option"
      },
      "description": "Choose the reason for the change request",
      "searcherKey": "com.atlassian.jira.plugin.system.customfieldtypes:multiselectsearcher",
      "screensCount": 2, "contextsCount": 2, "projectsCount": 2
    }
  ]
}
```
So a select-type custom field is identifiable by `schema.custom` ending in `:select` and `schema.type: "option"`. Calling `GET /rest/api/3/field/search?query=Stream&type=custom` against `wealthos.atlassian.net` should return the "Stream" field's real `customfield_XXXXX` id directly.

### Alternative: issue `editmeta`
`GET /rest/api/3/issue/{issueIdOrKey}/editmeta` returns only the fields editable on that specific issue's edit screen, keyed by field id, with `schema.customId` for custom fields:
```json
{"fields":{"summary":{"allowedValues":["red","blue"],"defaultValue":"red","hasDefaultValue":false,"key":"field_key","name":"My Multi Select","operations":["set","add"],"required":false,"schema":{"custom":"com.atlassian.jira.plugin.system.customfieldtypes:multiselect","customId":10001,"items":"option","type":"array"}}}}
```
This is useful if "Stream" needs its **allowed option values** (e.g. to validate/label a select field), since `editmeta`/`createmeta` return `allowedValues` for select-type fields where the plain `/field` and `/field/search` endpoints don't.

**Recommendation for phase 1**: do the "Stream" field-id lookup once (via `field/search?query=Stream`), record the resulting `customfield_XXXXX` id in config, and reference it directly in subsequent JQL/`fields=` requests — don't re-resolve by name on every sync (per-instance ids are stable until an admin deletes/recreates the field).

**Needs live verification**: run `GET /rest/api/3/field/search?query=Stream&type=custom` against `wealthos.atlassian.net` to get the real `customfield_XXXXX` id and confirm it is in fact `type: "option"` (single-select) rather than `type: "array"` (multi-select) — the ticket's premise says single-select but this should be confirmed rather than assumed.

---

## 5. Bulk / JQL search

### The old endpoint is being removed — already effectively gone
`GET /rest/api/3/search` and `POST /rest/api/3/search` (and their `/2/` counterparts) are marked in the **live OpenAPI spec itself** as:
> "Endpoint is currently being removed. [More details](https://developer.atlassian.com/changelog/#CHANGE-2046)"

and `"deprecated": true` in both operations. This isn't a future-tense warning — per multiple corroborating Atlassian Community threads (not primary, but consistent and dated), the sunset was staged through 2025 (initial deprecation ~May 1 2025, sunset window through ~Aug–Sep 2025), and instances have been returning **HTTP 410 Gone** on the old `/search` endpoint since. Given today's date (Aug 2026), **treat `/rest/api/3/search` as unusable** for a new integration — don't build against it at all.

### Recommended endpoint: `/rest/api/3/search/jql`
[`api-group-issue-search`](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issue-search/) — both `GET` and `POST` variants exist, not deprecated (`"deprecated": false"` in the spec). Auth: `basicAuth` or OAuth2 `read:jira-work`; anonymously callable if the instance allows it.

Key params (identical set on GET as query params / POST as JSON body via the `SearchAndReconcileRequestBean` schema):
- **`jql`** — e.g. `assignee = "712020:abcd1234-..." AND sprint = 456` — directly answers the "assignee + sprint" query requirement. Note the endpoint **requires a "bounded" query** (must have a real restriction clause) for performance reasons — `order by key desc` alone is rejected; `assignee = currentUser() order by key` is fine.
- **`fields`** — comma-separated allow-list, exactly the "just status and summary" lightweight-sync case: `fields=summary,status`. Default (if omitted) is `id` only — **note this differs from single-issue GET, whose default is all fields** — easy footgun if code assumes parity between the two endpoints.
- **`maxResults`** — default 50, "It returns max 5000 issues" (per page — still paginated via `nextPageToken`, see below).
- **`expand`** — `renderedFields`, `names`, `schema`, `transitions`, `operations`, `editmeta`, `changelog`, `versionedRepresentations`.
- **`nextPageToken`** — this endpoint uses **token-based pagination**, not `startAt`/offset like the old `/search` and the Agile APIs: "The first page has a `nextPageToken` of `null`... The `nextPageToken` field is not included in the response for the last page." This is a real API-shape difference to design around if code assumes uniform offset pagination across all Jira endpoints in this integration.
- **`reconcileIssues`** — for read-after-write consistency if the sync ever needs strong consistency right after a webhook/user edit (max 50 ids); "Recent updates might not be immediately visible in the returned search results" otherwise — i.e. **JQL search is eventually consistent**, worth noting for a "sync button" UX (a change made in Jira seconds ago might not show up yet).

Example response shape (issue objects nested exactly like single-issue GET, just wrapped):
```json
{"isLast": true, "issues": [ { "expand": "", "fields": { ... }, "id": "10002", "key": "EX-1", "self": "..." } ] }
```

### True bulk multi-issue fetch: `POST /rest/api/3/issue/bulkfetch`
Confirmed to exist exactly as hypothesized in the ticket: [`api-group-issue-search`](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issue-search/#api-rest-api-3-issue-bulkfetch-post).
> "Returns the details for a set of requested issues. **You can request up to 100 issues.**"

Request body:
```json
{
  "expand": ["names"],
  "fields": ["summary", "project", "assignee"],
  "fieldsByKeys": false,
  "issueIdsOrKeys": ["EX-1", "EX-2", "10005"],
  "properties": []
}
```
Response wraps a `fields`-shaped issue per key, plus an `issueErrors` array for any keys that couldn't be fetched (so partial failures don't 404 the whole request):
```json
{
  "expand": "schema,names",
  "issueErrors": [],
  "issues": [
    {"expand": "", "fields": {"summary": "My first example issue", "project": {...}, "assignee": {"accountId": "5b10a2844c20165700ede21g", "displayName": "Mia Krystof", "emailAddress": "mia@example.com", ...}}, "id": "10002", "key": "EX-1", "self": "..."}
  ]
}
```
This is a better fit than JQL search for "I already have a known list of N issue keys (e.g. from a sprint) and want their current fields in one round trip" — 100 keys per call is a real ceiling to design pagination around for anything larger.

**Recommendation for phase 1's likely two use cases**:
- **Discovery** ("what does assignee X have in sprint Y") → `GET/POST /rest/api/3/search/jql` with `fields=summary,status` (or whatever field set is actually needed) for a cheap payload.
- **Refresh of already-known issues** (e.g. re-syncing a set of tickets already linked into my-planner) → `POST /rest/api/3/issue/bulkfetch`, batched at ≤100 keys.

**Needs live verification**: confirm `wealthos.atlassian.net` has actually completed the `/search` → `/search/jql` migration (it should have, per the sunset timeline, but a very old/paused instance is the one edge case worth a quick smoke test — a single `curl` against `/rest/api/3/search/jql` before writing any code against it).

---

## 6. Rate limits

Source: [Rate limiting](https://developer.atlassian.com/cloud/jira/platform/rate-limiting/).

Three independent, simultaneously-enforced systems:
1. **Points-based hourly quota** — the one that matters most for a sync button. Cost model:
   | Operation | Cost |
   |---|---|
   | Core domain reads (issues, projects, etc.) | 1 base point + 1 point per object returned |
   | Identity/access reads (users, groups) | 1 base point + 2 points per object |
   | Any write (POST/PUT/PATCH/DELETE) | 1 flat point |

   Example from the docs: fetching one issue ≈ 2 points; a JQL search or bulk-fetch returning N issues costs roughly `1 + N` points. A "sync button" pulling, say, 30–50 issues costs on the order of 30–100 points per click — trivially small against the quota tiers below.
2. **Per-second burst limits** (token-bucket, steady-state refill + burst buffer) — protects against request bursts, not relevant to a single manual click firing a handful of sequential calls.
3. **Per-issue write limits** (20/2s, 100/30s) — irrelevant, this feature is read-only.

**Quota tiers**: apps typically sit in a shared global pool (65,000 points/hour across all installs of an app) unless the instance has its own per-tenant pool — Standard edition: "100,000 base + 10 points per user per hour"; higher for Premium/Enterprise. A single personal-planner sync button will not meaningfully dent this at any tier.

**Response headers** when throttling is active: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` (ISO 8601), `Retry-After` (seconds), `RateLimit-Reason` (which of the three systems tripped). There are also `Beta-RateLimit*` headers that are informational-only today (no enforcement yet) — worth reading defensively (log them) but not branching logic on.

**Guidance directly relevant to a manual/occasional-click pattern** (per the docs): this usage shape is explicitly the *good* case — "distribute requests evenly... rather than in spikes" and "design around steady-state limits, not burst buffers" are both trivially satisfied by a human clicking a button occasionally rather than polling. The only defensive coding worth doing: handle a `429`/`Retry-After` gracefully (surface "Jira is rate-limiting, try again in Ns" rather than a raw error), since it's a real (if unlikely) response shape, not a hypothetical.

**Needs live verification**: none really — this is instance-tier info, not something worth confirming against WOSMVP specifically; the numbers are far above what a manual sync could plausibly trigger.

---

## Summary of things to test live before/while implementing

1. `GET /rest/agile/1.0/board?name=Odyssey` (or `?projectKeyOrId=WOSMVP`) → real board id.
2. `GET /rest/agile/1.0/board/{boardId}/sprint?state=active` → confirm sprint list/shape matches docs for this instance.
3. `GET /rest/api/3/field/search?query=Stream&type=custom` → real `customfield_XXXXX` id for "Stream", and confirm single-select (`type: "option"`) vs multi-select (`type: "array"`).
4. `GET /rest/api/3/issue/WOSMVP-14782` → confirm actual shapes of `assignee` (is `emailAddress` populated or null for this org's privacy settings?), `parent` (populated per the unified model, or is this still on legacy Epic Link?), `subtasks` (exact array shape — not independently re-verified from a fresh primary-source example in this pass), and whatever the real estimate/story-points custom field id turns out to be.
5. `GET/POST /rest/api/3/search/jql?jql=assignee=X AND sprint=Y&fields=summary,status` → confirm the migration off the old `/search` endpoint is complete on this instance (should be, per Atlassian's 2025 sunset, but worth one smoke-test call before building on it).
6. `POST /rest/api/3/issue/bulkfetch` with a handful of real WOSMVP keys → confirm response shape and that the 100-key cap is workable for expected sync sizes.
