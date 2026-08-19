# 09 — Task editing

**What to build:** Within the Dashboard's task-tree drill-down (ticket 08), a task or sub-task row becomes editable in place:

- **Start/end dates**: manual date inputs on the task, independent of Jira (Jira has no standard "start date" field on any issue type, and `duedate` is deliberately not used — see `spec.md` §2).
- **Notes**: rich text, reusing the app's existing editor (`packages/frontend/src/components/RichTextEditor.tsx` / `ExpandableNotesEditor.tsx`) — same component family as Note/Todo notes elsewhere in the app.
- **At-risk override**: a manual toggle. Also implement the **auto-risk rule**: a task auto-flags at-risk once today's date passes its `endDate` while `status` isn't Done — reactive only, no configurable window. Store the resolved value as an explicit `atRisk` boolean (not a derived-at-read value) so a manual override survives a later Jira sync, which only ever touches Jira-sourced fields (title, status, assignee) and never touches `atRisk`.
- **Blocked-by links**: add/remove links to any other task, in **any** epic (not scoped to the same epic) — a picker searching across all tracked, non-archived tasks. No cycle validation anywhere, at creation or later — circular chains are allowed and simply displayed as-is.

None of this writes anything back to Jira — dates, notes, risk, and blocked-by are Atlas-local fields with no Jira-side counterpart (per `CLAUDE.md`'s one-way-flow rule).

**Blocked by:** Dashboard view (read-only) ([08](08-dashboard-view.md))

**Status:** ready-for-agent

- [ ] Editing a task's start/end date persists and is reflected in the row immediately (and in the epic's date-range roll-up)
- [ ] Editing a task's notes uses the existing rich-text editor and the notes indicator (ticket 08) reflects non-empty state
- [ ] A task whose end date has passed and whose status isn't Done shows as at-risk automatically, without any manual action
- [ ] Manually toggling at-risk overrides the auto-computed value and survives a re-sync of that epic
- [ ] A task can be linked as "blocked by" a task in a different epic, and the row shows the cross-epic blocker chip (per ticket 08's epic-suffix format)
- [ ] Creating a circular blocked-by chain (A blocks B, B blocks A) is allowed without error or warning
