# 04 — Bar placement algorithm spec

Type: grilling
Status: resolved
Blocked by: 02

## Question

Specify the exact walk-forward algorithm that computes each ticket bar's start/end date per row:

- Starting cursor: the sprint's `startDate`.
- Per-day available hours: derived from the person's `effectivePercentage` (from `SprintCapacity`), zeroed out on leave days (`leaveEntries`, honoring `full`/`half` portion) and sprint `holidays` — per the map's "skip non-working days" decision.
- How `estimateHours` (or `devEstimateHours`/`qaEstimateHours` for split placements) consumes the cursor to produce a bar's start and end date, in planning-sheet order for placements with no saved override.
- How an **existing start-date override** on ticket N in a row affects auto-placement of not-yet-overridden tickets after N in that same row (does the cursor resume immediately after the overridden bar's end, or does it ignore the override and continue from where it would have been without it — allowing the overlap the map already permits?).
- Where this computation runs: frontend (derived client-side from data `useSprintPlan` already fetches) or as a new backend endpoint — and why, given the precedent that `computeCapacity`/`plannedHours` live server-side today.

Resolve using the row-structure decision from Ticket 02 (one cursor per person, or one per person-per-role).

## Answer

**One walk-forward cursor per person** (per Ticket 02), starting at the sprint's `startDate`, producing bar start/end dates as follows:

**1. Hours consumed**: a bar's duration is sized from `plannedHours`/`devPlannedHours`/`qaPlannedHours` (Plan minus Spill — what's actually planned to land this sprint), **not** raw `estimateHours`/`devEstimateHours`/`qaEstimateHours`. This matches the Planning sheet's own badge precedent (`PlanningView.tsx:607-640`, which shows `plannedHours` as the primary figure) and keeps the Gantt's total bar-time for a person consistent with the Capacity card's own Planned/Available/Remaining figures, which are likewise built from `plannedHours` (`services/planSpill.ts`).

**2. Per-day available-hours formula** (deliberately a simplified heuristic, not a bit-for-bit replica of `capacityFormula.ts`'s whole-sprint math):
- Each working day (per `computeWorkingDates` — excludes weekends/holidays) contributes a flat `8 × effectivePercentage / 100` hours.
- A full-leave or holiday day contributes **0** hours (fully skipped).
- A half-leave day contributes **half** that day's rate.
- The `CapacityLookup` exception table (rare admin-configured `(percentage, workingDays)` → hours overrides) is deliberately **not** decomposed per day — it encodes a whole-sprint total, not a daily rate. Accepted tradeoff: in the rare case a lookup exception applies to a person, the Gantt's bar-time total may diverge slightly from the Capacity card's exact Available figure. The Gantt is a placement visualization, not the capacity source of truth.

**3. Bar placement**: for placements with no saved override, in planning-sheet order (the row's shared `order`/`devOrder`/`qaOrder` index space per Ticket 02), each ticket's hours consume the cursor day by day (per #2) until exhausted, producing its start/end dates; the cursor then advances to the next working day for the next ticket.

**4. Existing-override interaction**: when the cursor reaches a ticket that already has a saved start-date override, it does **not** auto-place that ticket (its position is fixed by the override) — instead the cursor jumps to `max(cursor, override.end)` and continues auto-placing subsequent not-yet-overridden tickets from there. This means dragging a bar later effectively "opens a gap" that later auto-placed tickets flow around, rather than through — matching the destination's framing of drag as opening a gap. Accidental overlaps between auto-placed tickets and a dragged one are avoided by default; the map's "overlapping bars allowed freely" still applies when the user explicitly drags one bar onto another.

**5. Computation location**: **frontend**, derived client-side from data `useSprintPlan` already fetches (`entries`, `capacity`, `memberships`, `TeamSprintPlan`) — no new backend endpoint. This is pure display-layout math with no side effects and nothing requiring cross-client consistency or persistence, unlike `computeCapacity`/`plannedHours`, which live server-side because they depend on data the frontend doesn't otherwise fetch in full (Jira sync internals, the `CapacityLookup` table).
