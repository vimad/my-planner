# 04 — Bar placement algorithm spec

Type: grilling
Status: open
Blocked by: 02

## Question

Specify the exact walk-forward algorithm that computes each ticket bar's start/end date per row:

- Starting cursor: the sprint's `startDate`.
- Per-day available hours: derived from the person's `effectivePercentage` (from `SprintCapacity`), zeroed out on leave days (`leaveEntries`, honoring `full`/`half` portion) and sprint `holidays` — per the map's "skip non-working days" decision.
- How `estimateHours` (or `devEstimateHours`/`qaEstimateHours` for split placements) consumes the cursor to produce a bar's start and end date, in planning-sheet order for placements with no saved override.
- How an **existing start-date override** on ticket N in a row affects auto-placement of not-yet-overridden tickets after N in that same row (does the cursor resume immediately after the overridden bar's end, or does it ignore the override and continue from where it would have been without it — allowing the overlap the map already permits?).
- Where this computation runs: frontend (derived client-side from data `useSprintPlan` already fetches) or as a new backend endpoint — and why, given the precedent that `computeCapacity`/`plannedHours` live server-side today.

Resolve using the row-structure decision from Ticket 02 (one cursor per person, or one per person-per-role).
