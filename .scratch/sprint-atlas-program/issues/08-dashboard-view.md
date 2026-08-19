# 08 — Dashboard view (read-only)

**What to build:** Replace ticket 07's minimal list with the full Dashboard layout from `spec.md` §6 / the winning prototype variant (branch `prototype/atlas-dashboard-ui-variants`, Variant B). Read-only — no editing controls yet (that's tickets 09/10).

- **Epic overview row**: one row per epic — key + title, a thin progress bar with done% (computed from that epic's tasks' status buckets, not stored), four count pills (To Do / In Progress / Done / At-risk, At-risk only shown when >0), date range (min start – max end across the epic's tasks) right-aligned, "Open in Jira" icon-link. Table-style list, not cards.
- **Drill-down**: clicking a row expands its task tree **inline, in normal document flow**, directly beneath it (accordion — one epic open by default, not exclusive-enforced). No drawer/modal.
- **Task/sub-task row** (recursive, same component at every depth): line 1 — Jira key (mono, fuchsia) + status badge + title; line 2 — date range + a notes indicator when notes are non-empty; line 3 — "Blocked by" chips when present, each showing the blocker's key with ` · <epicKey>` appended when the blocker is in a different epic. Sub-task rows indented `18px` per depth with a left border guide.
- **Epic-level notes**: shown once, as a plain text line under the epic row's divider, above the task rows (empty for now since epic-notes editing is ticket 10).

Follow `docs/ui-conventions.md` for color/border/radius/shadow/spacing conventions matching this archetype (closest to `NotesView`'s tree, per the prototype's own note); the inline-accordion drill-down is a deliberate, already-approved deviation from the catalogued dropdown/modal/drawer/card archetypes, not a new one to invent.

**Blocked by:** Track & sync an epic ([07](07-track-sync-epic.md))

**Status:** done

- [x] Dashboard lists every tracked, non-archived epic as an overview row with progress bar, status/at-risk pills, date range, and Jira link, matching real synced data
- [x] Clicking an epic row expands its task tree inline (not a drawer/modal), showing every task and sub-task recursively with correct indentation
- [x] Each task/sub-task row shows status badge, dates, a notes indicator when notes exist, and blocked-by chips (epic-suffixed when cross-epic) when present
- [x] Layout and styling follow `docs/ui-conventions.md`'s existing conventions for the matched archetype
