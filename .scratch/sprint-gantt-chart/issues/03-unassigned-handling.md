# 03 — Unassigned / unresolved-role ticket handling

Type: grilling
Status: resolved

## Question

How should tickets or roles with no resolved assignee render on the Gantt? Two cases:

1. A `SprintPlanEntry` with no `assigneeAccountId` at all (non-split ticket, unassigned).
2. A Split ticket where `devQa.dev` or `devQa.qa` resolves to `'unmapped'` or `'needs-assignment'` rather than `'resolved'`.

Options include excluding these entirely from the initial Gantt render, or giving them a dedicated "Unassigned" pseudo-row. Whatever is decided must also specify what the placement algorithm (Ticket 04) does for these — they still have `estimateHours` but no row to walk a cursor along.

## Answer

**Excluded entirely.** Both cases (a non-split entry with no `assigneeAccountId`, and a Split role whose `devQa.dev`/`devQa.qa` is `unmapped` or `needs-assignment`) are omitted from the Gantt's initial render — no pseudo-row, no bar. They stay visible only via the Planning sheet's existing "Unmapped"/"Needs dev/qa" catch-all rows (`PlanningView.tsx:1294-1305`), which this decision leaves untouched.

Rationale: these entries have no `SprintCapacity` record (no `effectivePercentage`, no `leaveEntries`) since there's no real person behind them, so there's no working-days cursor to walk a bar along — and the Gantt's value is showing *when* work happens for *someone*, which doesn't apply here. No need to duplicate the Planning sheet's existing surfacing mechanism on the Gantt too.

**Consequence for Ticket 04**: the placement algorithm only ever runs for placements that resolved to a real `TeamMembership` — it never needs a "no capacity data" branch.
