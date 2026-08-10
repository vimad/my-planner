# 14 — Capacity: models + formula + API

**What to build:** The Total/Available/Planned/Remaining capacity figures the Planning view's capacity strip (ticket 18) renders per person — models for the manual inputs, the formula, and the endpoint that computes it. Backend-only, verified via API/unit tests. See `.scratch/sprint-jira-integration/spec.md` ("Domain model — Capacity").

**Blocked by:** 12 — Team, Person & TeamMembership: models + CRUD API; 13 — Sprint, Ticket, Epic & SprintPlanEntry: models + Full sync + Planning API.

**Status:** ready-for-agent

- [ ] `packages/backend/src/models/TeamSprintPlan.ts`: `teamId`, `sprintId`, `workingDays: number` (manually entered, holiday-adjusted — never derived from a calendar). Unique on `(teamId, sprintId)`.
- [ ] `packages/backend/src/models/CapacityEntry.ts`: `teamMembershipId` (ref `TeamMembership`), `sprintId`, `leaveDays: number` (0.5-day granularity, default 0). Unique on `(teamMembershipId, sprintId)`.
- [ ] `packages/backend/src/models/CapacityLookup.ts`: `percentage: number`, `days: number`, `hours: number` — global, seeded via a migration/seed script with the reference spreadsheet's 12 cells (50/70/80% × 7/8/9/10 days).
- [ ] `packages/backend/src/routes/teamSprintPlans.ts`: `POST`/`GET`/`PATCH` for `TeamSprintPlan`, keyed on `(teamId, sprintId)`.
- [ ] `packages/backend/src/routes/capacityEntries.ts`: `POST`/`GET`/`PATCH` for `CapacityEntry`, keyed on `(teamMembershipId, sprintId)`.
- [ ] `packages/backend/src/routes/capacityLookup.ts`: full CRUD on `CapacityLookup` rows (the admin-editable settings view from ticket 17 or a later ticket manages this data, not code).
- [ ] `GET /api/teams/:teamId/sprints/:sprintId/capacity` — for every current `TeamMembership` on the team, computes:
  1. `Total = (TeamSprintPlan.workingDays − CapacityEntry.leaveDays) × 8`
  2. `effectiveDays = Total / 8`
  3. `Available` = matching `CapacityLookup` row for `(effectivePercentage, effectiveDays)` if one exists, else `Total × (effectivePercentage / 100)`
  4. `Planned` = sum of Effort (ticket 13) across that team+sprint's `SprintPlanEntry` list whose ticket's *current* assignee matches this person
  5. `Remaining = Available − Planned`

  `effectivePercentage = capacityPercentOverride ?? ROLE_DEFAULT_CAPACITY_PERCENT[role]`. 8 hours/day is a hardcoded constant.
- [ ] Backend tests reconcile at least the reference spreadsheet's worked example (a 10-day sprint, 1 day of personal leave → `Total = 72`) and cover: the `CapacityLookup` hit vs. fallback-formula paths, zero-leave/zero-override defaults, and `Planned` correctly summing only tickets whose *current* assignee (not whoever added them) matches.
