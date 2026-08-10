# 19 — Planning: drag-reorder + "Sync plan" button

**What to build:** Per-row drag-and-drop reordering of ticket badges, persisted, plus the global full-resync action — the two remaining interactive pieces of the Planning table from ticket 18. Demoable: drag a badge to a new position within a person's row and reload — the order sticks; click "Sync plan" and see every ticket's data (and staleness) refresh. See `.scratch/sprint-jira-integration/spec.md` ("Planning view UI", ticket 10's resolution).

**Blocked by:** 13 — Sprint, Ticket, Epic & SprintPlanEntry: models + Full sync + Planning API; 18 — Planning view: capacity strip + ticket table.

**Status:** ready-for-agent

- [ ] Ticket badges within a person's row are drag-and-drop reorderable using the same `@dnd-kit` sortable pattern as `TodoDetail.tsx`'s linked-todo list / `BoardsView.tsx` (visible drag handle or drag affordance, drop-position preview, keyboard support).
- [ ] Reordering triggers a save-on-drop `PATCH /api/sprint-plan-entries/:id` (ticket 13) for the affected entries in that row — no separate save step, no cross-row dragging (each person's row is its own sortable context).
- [ ] Global "Sync plan" button (single button, no per-ticket resync affordance) calls `POST /api/sprint-plan-entries/sync` (ticket 13); shows loading state and updates every ticket's `lastSyncedAt`/relative-time display on completion.
- [ ] After a sync that reassigns a ticket to a different person (ticket 13's reassignment-reset logic), the UI reflects the ticket moving to the new person's row, appended at the end.
- [ ] Frontend tests cover: drag-reorder within a row persists via the PATCH call and survives a reload, the sync button's loading/success/error states, and a reassigned ticket visually moving rows after sync.
