# 10 — Epic lifecycle management

**What to build:**

- **Epic-level notes**: rich text on the epic itself (same editor as ticket 09's task notes), shown on the Dashboard's epic-notes line (ticket 08, currently empty).
- **Manual "Sync now"**: a per-epic refresh action, and a global "sync all" action. This is the *only* way data updates after the initial sync (ticket 07) — there is no lazy or background auto-refresh, no staleness-based cache.
- **Un-track / archive**: an action that archives an epic (`AtlasEpic.archived = true`) rather than deleting it — its tasks, sub-tasks, and all local annotations (notes, dates, risk, blocked-by) stay intact and are restorable, just hidden from the main Dashboard list.
- **Archived list + restore**: a "Show N archived epics" toggle beneath the main table reveals archived epics at reduced opacity, each still independently expandable (read-only drill-down); a restore action un-sets `archived`.
- **Jira-side delete on a later sync**: if a previously-synced task's Jira issue is gone, archive the corresponding `AtlasTask` (soft-delete, restorable) rather than removing it or its annotations.
- **Jira-side reparent on a later sync**: if a task's Jira parent has changed, move its `epicId`/`parentTaskId` to match — all local annotations stay attached, unchanged.

**Blocked by:** Dashboard view (read-only) ([08](08-dashboard-view.md))

**Status:** ready-for-agent

- [ ] Editing an epic's notes persists and shows on its Dashboard row
- [ ] "Sync now" on a single epic re-pulls its tree from Jira and reflects new/changed/removed tasks, without touching any other epic
- [ ] A global sync action re-syncs every tracked, non-archived epic
- [ ] Un-tracking an epic hides it from the main list but its tasks/annotations remain in storage, verifiable via the archived list
- [ ] "Show N archived epics" reveals archived epics (reduced opacity, still expandable) and a restore action returns one to the main list
- [ ] Re-syncing an epic after a task's Jira issue was deleted archives that `AtlasTask` locally, preserving its notes/dates/risk/blocked-by
- [ ] Re-syncing an epic after a task was reparented in Jira moves it under its new epic locally, preserving its notes/dates/risk/blocked-by
