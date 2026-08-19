# Jira epic/task sync mechanics

Type: research
Status: resolved

## Question

Research Jira's REST/Agile API for fetching an epic's full task/sub-task tree, so Atlas's sync service can be spec'd:

- What endpoint(s)/JQL fetch an epic's direct child issues, and their children in turn (e.g. `search` with `"Epic Link" = KEY` or `parent = KEY`, vs. the Agile API's `/epic/{epicIdOrKey}/issue`)?
- How many hierarchy levels does Jira actually support below an Epic? Is Epic → Task/Story → Sub-task a hard ceiling, or can a Sub-task itself have children?
- Which fields carry: status category (To Do/In Progress/Done bucket), assignee, and any start/due-date fields that exist on these issue types (informational only — Atlas's own dates are manual, but worth knowing what Jira already exposes).
- Pagination and rate-limit behavior relevant to syncing potentially many issues per epic (mirrors what `services/sprintSync.ts` already handles for the existing Sprint feature — check that file for the established pattern first).

Constraint: read-only only — GET/search calls, never create/update/transition/delete. See `CLAUDE.md`'s "Jira integration — READ-ONLY, critical".

## Answer

Full findings: [`research/jira-epic-sync-mechanics.md`](research/jira-epic-sync-mechanics.md) (branch `research/atlas-jira-sync-mechanics`).

1. **Fetch mechanism**: `POST /rest/api/3/search/jql`, not the Agile API's `/epic/{key}/issue` (Atlassian's own docs say not to use that on next-gen projects). Two viable JQL shapes, both project-type-agnostic: (a) two-step `parent = <epicKey>` then `parent = <childKey>`/bulk-fetch — a near copy of `ticketSync.ts`'s existing pattern; or (b) one-shot `parentEpic = <epicKey>`, which Atlassian's support KB confirms returns an epic's children *and* their sub-tasks in one query. Needs a live check before committing to (b) over (a).
2. **Hierarchy depth**: Sub-task is a hard floor — Epic → Task/Story → Sub-task, no deeper, confirmed by Atlassian's docs and already assumed by this codebase's `ticketSync.ts`. Custom hierarchy levels (Premium/Enterprise) only ever add levels *above* Epic, never below Sub-task. Atlas's sync never needs to walk more than two hops past the epic.
3. **Fields**: status category is `fields.status.statusCategory.key` (`new`/`indeterminate`/`done`) — a cleaner signal than `statusSync.ts`'s board-position heuristic, and usable directly since Atlas isn't board-scoped. Assignee is `fields.assignee.accountId` (durable; `displayName`/`emailAddress` can be null). `duedate` is a standard system field (informational only — Atlas's own dates are manual). No standard "start date" field exists on any issue type.
4. **Pagination/rate limits**: reuse `jiraClient.ts` as-is — `searchJql`'s token pagination, `bulkFetchIssues`'s 100-key chunking, `jiraFetch`'s single 429-retry. None of it is Sprint-specific, so Atlas's sync service can import `jiraClient.ts` directly and just write its own new mapping layer targeting Atlas's new Mongo collections (answers the map's "reuse existing Jira client?" open question: yes, at the `jiraClient.ts` layer).
