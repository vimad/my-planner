# Wayfinder map: Atlas program tracker

Label: `wayfinder:map`

## Destination

A spec for **Atlas** — a new, fully independent third tab in the Sprint section's tab panel (alongside Planning/Status, sharing the tab row but with no data or navigational relationship to either, and no Team scoping — it shows regardless of which team, if any, is selected).

Atlas tracks exactly one hardcoded program (no Program entity — Epic is the top-level record). You manually enter Jira epic keys (e.g. `WOSMVP-123`); each entry triggers a sync that auto-pulls the epic's full task/sub-task tree from Jira — you never enter task keys yourself. Task and Sub-task share one recursive shape (a sub-task is a task nested one level deeper, same fields, same capabilities), and there's no dev/qa split — every task is just a task.

Each task/sub-task carries:
- Status, collapsed from Jira's real workflow into three buckets: To Do / In Progress / Done
- Start/end dates — manual, set in Atlas, independent of Jira
- An at-risk flag — both auto-suggested (from dates/status) and manually overridable
- Rich-text notes (reusing the app's existing notes editor)
- "Blocked by" links to other tasks

Epics also carry their own rich-text notes and roll up their tasks' progress for the overview.

All of this lives in brand-new Mongo collections — nothing is reused from the existing Ticket/Team/Sprint/Epic models. Jira access stays read-only per the project's Jira integration rule.

Two views:
- **Dashboard** — epic overview cards, drill into a task tree per epic. The day-to-day management surface.
- **Present** — a separate, dedicated read-only screen-share-friendly summary for narrating a standup update (not just the Dashboard with edit controls hidden).

The map is done when every open decision below the sync mechanics, task rules, and both views' designs is resolved — at that point the destination is a spec ready to hand to an implementation session. Nothing gets built during this map itself.

## Notes

- Domain glossary: `CONTEXT.md` (existing Sprint-context terms — Team, Ticket, Epic, Sprint, etc. — for contrast; Atlas is deliberately **not** reusing any of them)
- UI conventions: `docs/ui-conventions.md` — check before designing the Dashboard/Present views
- Jira integration is read-only, always — see `CLAUDE.md` "Jira integration — READ-ONLY, critical". Any research or prototype work against the real Jira instance must only ever read/search/fetch.
- Existing Sprint tab structure for reference: `packages/frontend/src/components/SprintShell.tsx` (tab row, per-team routing)

## Decisions so far

- [Jira epic/task sync mechanics](issues/01-jira-epic-sync-mechanics.md) — Atlas syncs via JQL `POST /rest/api/3/search/jql` (`parent =`/`parentEpic =`, not the Agile API), hierarchy hard-floors at Sub-task (never deeper), reads `fields.status.statusCategory.key`/`fields.assignee.accountId` off synced issues, and reuses `jiraClient.ts` directly for auth/pagination/rate-limiting — full findings in [`research/jira-epic-sync-mechanics.md`](research/jira-epic-sync-mechanics.md).
- [Sync & lifecycle rules](issues/02-sync-lifecycle-rules.md) — entering an epic key syncs it immediately; refresh afterward is manual-only (no lazy/background auto-sync); an unresolvable/non-Epic key is rejected at entry, nothing saved; un-tracking an epic archives it (soft-delete, restorable) rather than deleting.

_(The remaining items below were settled during destination-naming; none required a dedicated ticket. Restated here since there's no ticket to link — see the Destination above for the full picture.)_

- Data source: Jira-synced, not fully manual — but scoped by manually-entered epic keys, not a project/label/board-wide sync.
- Program entity: skipped — Atlas is the only program, hardcoded; Epic is the top-level record.
- Sub-task depth: full treatment, same shape as Task, recursive.
- Dependencies: simple "blocked by" links shown as a list — no graph/timeline UI.
- Notes: rich text, on both tasks and epics.
- Status source: Jira's real status, collapsed to To Do / In Progress / Done for summarizing.
- At-risk flag: both manual and auto-computed.
- Dates: manual, set in Atlas — not pulled from Jira.
- Nav structure: a new tab in the same tab panel as Planning/Status, fully independent of Team.

## Not yet specified

- Exact Mongoose schema / API route shapes for the new collections — these fall out of resolving the sync, lifecycle, and task-rule tickets rather than needing a decision of their own; the eventual spec compiles them.
- Whether to commit to the one-shot `parentEpic =` JQL query for the tree-fetch, or the two-step `parent =` approach mirroring `ticketSync.ts` — both are viable per the sync-mechanics research; needs a live check against a real epic (e.g. `WOSMVP-8262`) once Atlas's Jira access path exists, not resolvable from planning alone.

## Out of scope

_(none yet)_
