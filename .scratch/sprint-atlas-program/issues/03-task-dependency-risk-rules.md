# Task dependency & risk rules

Type: grilling
Status: resolved

## Question

Define task-level business rules:

- The exact auto-risk rule — e.g. how many days past the end date, or how close to it, does auto-flagging kick in? Does it consider status (only flag if not yet Done)?
- Can a task's "blocked by" links point to tasks in other epics, or are dependencies scoped to the same epic only?
- How are circular dependencies prevented or handled?
- What happens to a task's local annotations (notes, dates, risk, dependencies) if the underlying Jira issue is deleted or reparented to a different epic on a later sync?

## Answer

1. **Auto-risk rule**: a task auto-flags "at risk" once today's date passes its end date while status isn't Done. Simple and reactive — no configurable window, no "approaching deadline" pre-flagging.
2. **Dependency scope**: a "blocked by" link can point to any task in any epic — not scoped to the same epic. The Dashboard's task-tree UI (ticket 04) needs to show which epic a cross-epic blocker belongs to.
3. **Circular dependencies**: allowed, no validation at creation or anywhere else. Atlas never checks the dependency graph for cycles.
4. **Jira-side delete/reparent on sync**: a Jira-side delete archives the Atlas task (soft-delete, restorable) rather than hard-removing it or its annotations — consistent with the archive-don't-delete pattern already chosen for un-tracking an epic (ticket 02). A reparented issue simply moves under its new epic on the next sync; all its local annotations (notes/dates/risk/dependencies) stay attached to the task unchanged.
