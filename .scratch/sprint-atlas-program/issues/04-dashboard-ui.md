# Dashboard UI

Type: prototype
Status: resolved

Blocked by: 02, 03

## Question

Prototype the Atlas Dashboard view:

- The epic overview card — what summary stats does it show (status bucket counts, at-risk count, date range, a progress indicator)?
- The per-epic task-tree drill-down — how status/risk/dates/dependencies/notes are laid out per task/sub-task row, and how the nesting for sub-tasks reads visually.

Blocked on [Sync & lifecycle rules](../issues/02-sync-lifecycle-rules.md) and [Task dependency & risk rules](../issues/03-task-dependency-risk-rules.md) — the exact fields and rules those settle need to be visible and interactive in this view. Follow `docs/ui-conventions.md` for the archetype match (cards, drill-down panel).

## Answer

Prototyped three structurally different takes (React, mock data, `/prototype/atlas-dashboard`) — full set captured on the throwaway branch `prototype/atlas-dashboard-ui-variants`. **Variant B — "dense table + inline accordion" — won.**

Settled layout:

- **Epic overview**: not cards — a compact table-style list, one row per epic. Each row: epic key + title, a thin progress bar with `done%` next to it, four small count pills (To Do / In Progress / Done / At risk, the last only shown when >0, same color families as `STATUS_BADGE`/rose used elsewhere in Sprint), and the epic's date range (min start – max end across its tasks) right-aligned. A row also carries an "Open in Jira" icon-link.
- **Drill-down**: no drawer, no modal — clicking a row expands the task tree **inline, directly beneath it, in normal document flow** (accordion, one epic open at a time by default but not exclusive-enforced). This is the one deliberate deviation from `docs/ui-conventions.md`'s catalogued archetypes (dropdown/modal/drawer/card) — closest in spirit to a tree row, styled like `NotesView`'s tree rather than any card/popover/drawer archetype.
- **Task/sub-task row**: jira key (mono, fuchsia) + status badge + title on one line; a second line with the date range and a small "notes" indicator (icon + label) when notes are non-empty; a third line listing "Blocked by" chips only when present. Each blocked-by chip shows the blocker's key and, when it's in a different epic, ` · <epicKey>` appended — same chip in both same-epic and cross-epic cases, just with or without the epic suffix.
- **Sub-task nesting**: recursive — a sub-task row is the exact same row component, indented `18px` per depth level with a left border guide (`border-l`), no visual ceiling since the model hard-floors depth at one level anyway. Nesting reads as continued indentation, not a different row style.
- **Epic-level notes**: shown once, as a plain text line under the epic row's divider, above the task rows — not per-task chrome.
- **Archived epics**: excluded from the main list; a `Show N archived epics` text toggle beneath it reveals them (rendered at reduced opacity), each independently expandable the same way — this is the un-archive/restore entry point's home, though the restore action itself wasn't built into the prototype (still just "open" was proven interactive; the actual restore button is a trivial addition, not a fresh design question).
- **Add-epic entry point**: an inline text input + "Track" button above the table; submitting an unresolvable key shows an inline red error line and adds nothing, matching ticket 02.

Why B over A/C: it reads density-first, closer to `StatusView`/`PlanningView`'s existing board feel, and keeps the tree in-flow (scrollable with the page) rather than trapping it behind an overlay — better suited to "day-to-day management," per the Destination, than A's drawer or C's heavier modal-explorer (which also surfaced a real rough edge: cross-epic blocked-by navigation left the explorer's nav/header out of sync with the newly-selected task's epic).
