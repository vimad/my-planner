# 07 — Track & sync an epic

**What to build:** Entering a Jira epic key (e.g. `WOSMVP-123`) into the Atlas empty-state input and submitting it triggers an **immediate, synchronous** sync: the backend resolves the key against Jira, and if it's a valid Epic, recursively pulls its full task/sub-task tree and stores it in new, Atlas-only Mongo collections. Once sync completes, the epic and its tasks appear in a minimal list (epic key/title, task keys/titles/status, indented one level for sub-tasks) — no styling polish yet, that's ticket 08. An unresolvable key (404) or a key that resolves to a non-Epic issue type shows an inline error and **saves nothing**.

Per `CLAUDE.md`'s Jira read-only rule and the spec's one-way-data-flow callout: this sync only ever reads from Jira into these new collections — there is no write path back to Jira anywhere in this ticket.

**New Mongo collections** (see `spec.md` §2 for full field lists):
- `AtlasEpic` — `jiraKey`, `title`, `jiraUrl`, `notes` (leave empty for now, editing UI is ticket 10), `archived` (default `false`), `lastSyncedAt`.
- `AtlasTask` — recursive (`parentTaskId` ref, null for top-level), `epicId`, `jiraKey`, `title`, `jiraUrl`, `assigneeAccountId`, `status` (To Do/In Progress/Done, collapsed from `fields.status.statusCategory.key`), `startDate`/`endDate` (null for now — manual entry is ticket 09), `atRisk` (false for now — auto-computation is ticket 09), `notes` (empty for now), `blockedBy` (empty for now), `archived` (default `false`).

**Sync mechanics** (full research: `research/jira-epic-sync-mechanics.md`): reuse `packages/backend/src/services/jiraClient.ts` directly (`searchJql`, `bulkFetchIssues`, pagination/rate-limit handling already built) rather than writing new Jira HTTP plumbing. Use `POST /rest/api/3/search/jql`, not the Agile API. **Resolve the deferred JQL-shape question here, live**: try the one-shot `parentEpic = <epicKey>` query against a real epic (e.g. `WOSMVP-8262`) and confirm it returns the full child + sub-task tree in one call; fall back to the two-step `parent =` approach (mirroring `packages/backend/src/services/ticketSync.ts`'s existing pattern) if it doesn't hold up. Depth hard-floors at Sub-task — never walk deeper.

**Blocked by:** Atlas tab & nav scaffold ([06](06-atlas-tab-nav-scaffold.md))

**Status:** ready-for-agent

- [ ] `AtlasEpic` and `AtlasTask` Mongoose models exist with the fields above, plus REST routes to create (track) an epic and list tracked epics with their task trees
- [ ] Submitting a valid epic key syncs immediately (synchronous, with a loading state) and the epic + its full recursive task/sub-task tree appear in the list
- [ ] Submitting an unresolvable key or a non-Epic key shows an inline error and creates no `AtlasEpic`/`AtlasTask` documents
- [ ] Sync only ever issues read/search calls to Jira — no create/update/transition/delete calls anywhere in the sync path
- [ ] JQL shape (one-shot `parentEpic =` vs two-step `parent =`) has been verified against a real epic and the working approach is committed to code (not left as an open question)
