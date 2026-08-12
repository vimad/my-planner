# 03 — Unassigned / unresolved-role ticket handling

Type: grilling
Status: open

## Question

How should tickets or roles with no resolved assignee render on the Gantt? Two cases:

1. A `SprintPlanEntry` with no `assigneeAccountId` at all (non-split ticket, unassigned).
2. A Split ticket where `devQa.dev` or `devQa.qa` resolves to `'unmapped'` or `'needs-assignment'` rather than `'resolved'`.

Options include excluding these entirely from the initial Gantt render, or giving them a dedicated "Unassigned" pseudo-row. Whatever is decided must also specify what the placement algorithm (Ticket 04) does for these — they still have `estimateHours` but no row to walk a cursor along.
