# Capacity formula

Type: grilling
Status: resolved
Blocked by: 02

## Question

Map is [Sprint (Jira Integration) — Phase 1 Planning Map](../map.md).

Nail the exact capacity-table math, using the user's reference spreadsheet as ground truth (bring it into the session rather than guessing from the screenshot alone — some numbers, e.g. a person's Total sitting below the expected role-percentage baseline, didn't reconcile at a glance and need to be walked through live). Cover:

- Order of operations: base hours (working days × 8) → subtract leave/holiday hours → apply the person's effective capacity percentage (from ticket 02's `TeamMembership`). Confirm this exact order and whether percentage is applied to the pre- or post-leave figure.
- Where the sprint's working-day count comes from (holiday-adjusted 10/9/8/7-day sprints per the spreadsheet's note) — is this a per-sprint configured value, or derived from a holiday calendar?
- Where individual leave is entered — manual per-person-per-sprint input in the app (not sourced from Jira), confirm.
- The `Available`, `Planned`, `Remaining` columns: `Planned` = sum of estimates for tickets assigned to that person in that team+sprint (from ticket 03's `Ticket` model); `Remaining` = `Available` − `Planned`. Confirm rounding/precision rules (the spreadsheet shows fractional days like "4d1h").
- Whether the formula needs to be configurable (e.g. hours-per-day other than 8) or can be hardcoded for phase 1.

Blocked by ticket 02 (Team, Person & Team-Membership data model) since the role/percentage model must exist first. Feeds into ticket 08 (Planning view UI).

## Answer

Reconciled the spreadsheet numbers live with the user (e.g. a 10-day sprint with 1 day of personal leave giving `Total = 72` checks out exactly as `(10 − 1) × 8`), and converged on:

**Additional entities** (beyond tickets 02/03):
- `TeamSprintPlan` (Team × Sprint header): `teamId`, `sprintId`, `workingDays: number` — manually entered per team's sprint plan (holiday-adjusted, e.g. 10/9/8/7), not derived from any holiday calendar. Unique on `(teamId, sprintId)`.
- `CapacityEntry` (per Team Membership, per Sprint): `teamMembershipId` (ref `TeamMembership`), `sprintId`, `leaveDays: number` (0.5-day granularity, default 0). Unique on `(teamMembershipId, sprintId)`.
- `CapacityLookup` (global, admin-editable via a settings view, not hardcoded in code): `percentage: number`, `days: number`, `hours: number`. Seed with the user's current 12 cells (50/70/80% × 7/8/9/10 days); extendable later as a data entry, not a code change.

**Formula** (per person, per team, per sprint):
1. `Total = (TeamSprintPlan.workingDays − CapacityEntry.leaveDays) × 8`
2. `effectiveDays = Total / 8`
3. `Available` = matching `CapacityLookup` row for `(TeamMembership.effectivePercentage, effectiveDays)` if one exists, **else** `Total × (effectivePercentage / 100)`
4. `Planned` = sum of Effort (ticket 03's sub-task rollup rule) across tickets in this team+sprint's `SprintPlanEntry` list whose current Jira assignee matches this person
5. `Remaining = Available − Planned`

8 hours/day is a hardcoded constant (not configurable). Recorded in [CONTEXT.md](../../../CONTEXT.md) (Team Sprint Plan, Capacity Entry, Capacity Lookup, Total/Available/Planned/Remaining).
