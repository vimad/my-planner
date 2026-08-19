# Spec: Atlas program tracker

Status: ready for implementation

Compiled from the [Atlas program tracker map](map.md) — all five decision tickets resolved, no open decisions remain. This spec is the destination that map was finding its way to; it hands off directly to an implementation session (not itself part of that implementation).

## 1. What Atlas is

A new, fully independent third tab in the Sprint section's tab panel, alongside Planning/Status — sharing the tab row but with **no data or navigational relationship to either**, and **no Team scoping** (visible regardless of which team, if any, is selected). Reference the existing tab row wiring in `packages/frontend/src/components/SprintShell.tsx`.

Atlas tracks exactly one hardcoded program — there is no Program entity. **Epic is the top-level record.** You manually enter Jira epic keys (e.g. `WOSMVP-123`); each entry triggers an immediate sync that auto-pulls the epic's full task/sub-task tree from Jira. You never enter task keys yourself.

Task and Sub-task share **one recursive shape** — a sub-task is a task nested one level deeper, same fields, same capabilities. There is no dev/qa split; every task is just a task.

All of this lives in **brand-new Mongo collections** — nothing is reused from the existing Ticket/Team/Sprint/Epic models (see `CONTEXT.md` for those, kept only for contrast). Jira access is **read-only**, always — see `CLAUDE.md`'s "Jira integration — READ-ONLY, critical".

> **Data flows one way only: Jira → Atlas, never Atlas → Jira.** Sync pulls fields *from* Jira into Atlas's own Mongo collections (§2). It never pushes anything back — no status writes, no comments, no field updates, no transitions, nothing, at any level, under any circumstance. Everything Atlas adds on top of the synced Jira data (dates, notes, at-risk flags/overrides, blocked-by links, the To Do/In Progress/Done bucket itself) is **Atlas-local only** and has no Jira-side counterpart to write to. There is no "push changes to Jira" feature anywhere in this spec.

Two views:
- **Dashboard** — the day-to-day management surface.
- **Present** — a dedicated, read-only, screen-share-friendly standup summary.

## 2. Data model

Two new Mongo collections, no reuse of existing Sprint/Ticket/Epic models.

### AtlasEpic

| Field | Notes |
|---|---|
| `jiraKey` | e.g. `WOSMVP-123`. Unique. Set at entry, immutable. |
| `title`, `jiraUrl` | Pulled from Jira on sync. |
| `notes` | Rich text (reuse the app's existing notes editor). |
| `archived` | Boolean. Soft-delete flag for "un-tracking" (§4.4). Default `false`. |
| `lastSyncedAt` | Timestamp of most recent successful sync. |

Progress/status-bucket counts and date range are **derived at read time** from the epic's tasks, not stored on the epic — the dashboard row (§5) and Present strip/detail (§6) both compute status bucket counts, at-risk count, and min-start/max-end on the fly.

### AtlasTask

Recursive — one collection, one schema, for both Task and Sub-task. Depth hard-floors at one level of nesting (Epic → Task → Sub-task, never deeper — confirmed by Jira's own hierarchy limits, see §3).

| Field | Notes |
|---|---|
| `epicId` | Ref to `AtlasEpic`. A task always belongs to exactly one epic (the epic it's currently parented under in Jira). |
| `parentTaskId` | Ref to `AtlasTask`, null for top-level tasks. Set for sub-tasks. |
| `jiraKey`, `title`, `jiraUrl` | Pulled from Jira on sync. |
| `assigneeAccountId` | From `fields.assignee.accountId` (durable; display name/email can be null). Informational. |
| `status` | To Do / In Progress / Done — collapsed from Jira's `fields.status.statusCategory.key` (`new`/`indeterminate`/`done`). |
| `startDate`, `endDate` | Manual, set in Atlas. Independent of Jira — Jira exposes no standard "start date" field on any issue type, and `duedate` is not used (Atlas dates are deliberately manual, per the Destination). |
| `atRisk` | Boolean. Auto-computed (§4) but manually overridable — store an explicit flag rather than a pure derived value, so a manual override persists across syncs. |
| `notes` | Rich text. |
| `blockedBy` | Array of `AtlasTask` refs. Can point to tasks in **any** epic, not just the same one. No cycle validation. |
| `archived` | Boolean. Soft-delete flag for Jira-side deletes (§4.4). Default `false`. |

### API routes

Not separately specified — they fall out directly of the two collections above and the actions in §4 (track/sync/un-track an epic; CRUD on task dates/notes/risk-override/blocked-by). Standard REST-over-Mongoose per this codebase's existing model/route pattern (see e.g. `packages/backend/src/models/Sprint.ts` and its route file for the shape to match).

## 3. Jira sync mechanics

Full research: [`research/jira-epic-sync-mechanics.md`](research/jira-epic-sync-mechanics.md).

- **Endpoint**: `POST /rest/api/3/search/jql` — not the Agile API's `/epic/{key}/issue` (Atlassian's own docs advise against that endpoint on next-gen projects).
- **Client reuse**: import `packages/backend/src/services/jiraClient.ts` directly. Its pagination (`searchJql`'s token pagination), bulk-fetch chunking (`bulkFetchIssues`, 100-key chunks), and rate-limit handling (`jiraFetch`'s single 429-retry) are not Sprint-specific — Atlas's sync service just writes its own new mapping layer on top, targeting the collections in §2.
- **Hierarchy depth**: Sub-task is a hard floor. Epic → Task/Story → Sub-task, never deeper — Jira's custom hierarchy levels (Premium/Enterprise) only ever add levels *above* Epic. Atlas's sync never walks more than two hops past the epic.
- **Fields read off synced issues**: `fields.status.statusCategory.key` for status bucket; `fields.assignee.accountId` for assignee.
- **Query shape — open implementation-time question**: two JQL approaches are both viable and were not resolved during planning (see §7).
- **Constraint**: read-only only, GET/search calls, never create/update/transition/delete — per `CLAUDE.md`. The sync service has no write path to Jira at all — not even for Atlas-local fields like status bucket, dates, notes, or risk flags. Those are stored and mutated in Atlas's own collections (§2) exclusively.

## 4. Sync & lifecycle rules

1. **Sync trigger**: entering an epic key syncs it **immediately and synchronously**, with a loading state — its tasks/sub-tasks appear in the same interaction, not on a later load.
2. **Ongoing refresh**: **manual only**. No lazy/background auto-refresh on dashboard load, no staleness-based cache. A "Sync now" action (per-epic, and/or for everything) is the only way data updates after the initial sync.
3. **Bad key handling**: rejected at entry. If Jira can't resolve the key (404) or it doesn't resolve to an Epic-type issue, **nothing is saved** — inline error shown, the tracked-epics list stays always-valid.
4. **Un-tracking an epic**: archives it (`AtlasEpic.archived = true`), not a hard delete. Its tasks, sub-tasks, and all local annotations (notes, dates, risk flags, dependencies) stay intact and restorable — just hidden from the Dashboard while archived (§5). Needs an un-archive/restore affordance in the UI (trivial addition on top of the toggle already prototyped, not a fresh design question).
5. **Jira-side delete on later sync**: archives the corresponding `AtlasTask` (soft-delete, restorable) — same archive-don't-delete pattern as epic un-tracking. Local annotations are never hard-removed.
6. **Jira-side reparent on later sync**: the task's `epicId`/`parentTaskId` simply move to match its new Jira parent. All local annotations (notes/dates/risk/dependencies) stay attached, unchanged.

## 5. Task dependency & risk rules

1. **Auto-risk rule**: a task auto-flags at-risk once **today's date passes its `endDate` while `status` isn't Done**. Reactive only — no configurable window, no "approaching deadline" pre-flagging. The auto-computed value seeds `atRisk`; a manual toggle overrides it and persists across syncs (the sync only ever updates Jira-sourced fields, never `atRisk`).
2. **Dependency scope**: `blockedBy` can point to a task in **any** epic. The UI must show which epic a cross-epic blocker belongs to (handled in both views, §6).
3. **Circular dependencies**: allowed, unvalidated, everywhere. Atlas never checks the dependency graph for cycles.
4. **Jira-side delete/reparent**: covered in §4.5–4.6.

## 6. Dashboard view

Full prototype context: [Dashboard UI ticket](issues/04-dashboard-ui.md), three variants on branch `prototype/atlas-dashboard-ui-variants` (Variant B won). Follows `docs/ui-conventions.md` for archetype styling, with one deliberate deviation noted below.

- **Epic overview**: a compact table-style list, one row per epic (not cards). Each row: epic key + title, a thin progress bar with done% next to it, four small count pills (To Do / In Progress / Done / At-risk — At-risk pill only shown when >0, matching the app's existing `STATUS_BADGE`/rose color families), and the epic's date range (min start – max end across its tasks) right-aligned. An "Open in Jira" icon-link per row.
- **Drill-down**: clicking a row expands its task tree **inline, in normal document flow** directly beneath it — an accordion, not a drawer/modal, one epic open by default (not exclusive-enforced). This is the one deliberate deviation from `docs/ui-conventions.md`'s catalogued archetypes (dropdown/modal/drawer/card); styled closer to `NotesView`'s tree.
- **Task/sub-task row** (recursive — same component at every depth): line 1 — Jira key (mono, fuchsia) + status badge + title. Line 2 — date range + a "notes" indicator (icon + label) when notes are non-empty. Line 3 — "Blocked by" chips, only when present; each chip shows the blocker's key, with ` · <epicKey>` appended when the blocker is in a different epic. Sub-task rows are indented `18px` per depth level with a left border guide — no ceiling needed since depth hard-floors at one nested level.
- **Epic-level notes**: shown once, as a plain text line under the epic row's divider, above the task rows.
- **Archived epics**: excluded from the main list; a "Show N archived epics" text toggle reveals them at reduced opacity, each still independently expandable. This is the home for the restore affordance from §4.4.
- **Add-epic entry point**: inline text input + "Track" button above the table. Submitting an unresolvable key shows an inline red error line and adds nothing (§4.3).

## 7. Present view

Full prototype context: [Present view UI ticket](issues/05-present-view-ui.md), four variants on branch `prototype/atlas-present-ui-variants` (Variant D — "compact master/detail" — won).

- **Program strip** (always-visible, left-hand): one row per epic, no scrolling for a 3–5 epic program. Each row: a small progress ring colored by health (emerald on-track / amber watch / rose at-risk — a display-only grouping derived from at-risk count, not a new stored field), title, Jira key, and an at-risk count badge when >0. This is the whole-program-at-a-glance surface.
- **Detail pane** (right-hand): selecting a row — click, or ↑/↓ keys, no page transition — swaps a focused panel showing: epic key + Jira link + date range, title, health/progress line, status bucket counts, a "needs attention" digest (at-risk and blocked-by-not-Done tasks only, each with a reason and inline notes when present — cross-epic blocker keys shown inline, no epic-suffix chip needed since the digest is already scoped to one epic), then epic notes as a blockquote. Panel background tinted by the epic's health color. Clean epics get an explicit "on track" line rather than an empty section.
- **Archived epics**: never shown — Present is standup-facing, live epics only. Archive/restore stays a Dashboard-only concept.
- **Read-only**: no edit controls, no mutations anywhere. The only interactive surface is navigation (which epic is focused) and outbound Jira links.

## 8. Open question deferred to implementation

Not resolved during planning — needs a live check once Atlas's Jira access path exists in code, not resolvable from spec alone:

- **JQL query shape for the tree-fetch**: commit to the one-shot `parentEpic = <epicKey>` query (Atlassian support KB confirms it returns an epic's children *and* their sub-tasks in one query), or the two-step `parent = <epicKey>` then `parent = <childKey>`/bulk-fetch approach that mirrors `packages/backend/src/services/ticketSync.ts`'s existing pattern. Verify against a real epic (e.g. `WOSMVP-8262`) before finalizing the sync service's query.

## 9. Out of scope

None identified during planning.
