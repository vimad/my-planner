# 14 — Capacity: models + formula + API

**What to build:** The Total/Available/Planned/Remaining capacity figures the Planning view's capacity strip (ticket 18) renders per person — models for the manual inputs, the formula, and the endpoint that computes it. Backend-only, verified via API/unit tests. See `.scratch/sprint-jira-integration/spec.md` ("Domain model — Capacity").

**Blocked by:** 12 — Team, Person & TeamMembership: models + CRUD API; 13 — Sprint, Ticket, Epic & SprintPlanEntry: models + Full sync + Planning API.

**Status:** done

- [x] `packages/backend/src/models/TeamSprintPlan.ts`: `teamId`, `sprintId`, `workingDays: number` (manually entered, holiday-adjusted — never derived from a calendar). Unique on `(teamId, sprintId)`.
- [x] `packages/backend/src/models/CapacityEntry.ts`: `teamMembershipId` (ref `TeamMembership`), `sprintId`, `leaveDays: number` (0.5-day granularity, default 0). Unique on `(teamMembershipId, sprintId)`.
- [x] `packages/backend/src/models/CapacityLookup.ts`: `percentage: number`, `days: number`, `hours: number` — global, seeded via a migration/seed script with the reference spreadsheet's 12 cells (50/70/80% × 7/8/9/10 days). The real spreadsheet hours weren't available at implementation time (confirmed with the user); seeded instead with a rounded placeholder (`round(days × 8 × percentage / 100)`), correctable later via the ticket 17+ settings view without a code change — seeding is idempotent and never overwrites a row that already exists, so a later admin edit survives a reboot.
- [x] `packages/backend/src/routes/teamSprintPlans.ts`: `POST`/`GET`/`PATCH` for `TeamSprintPlan`, keyed on `(teamId, sprintId)`.
- [x] `packages/backend/src/routes/capacityEntries.ts`: `POST`/`GET`/`PATCH` for `CapacityEntry`, keyed on `(teamMembershipId, sprintId)`.
- [x] `packages/backend/src/routes/capacityLookup.ts`: full CRUD on `CapacityLookup` rows (the admin-editable settings view from ticket 17 or a later ticket manages this data, not code).
- [x] `GET /api/teams/:teamId/sprints/:sprintId/capacity` (`packages/backend/src/routes/capacity.ts`) — for every current `TeamMembership` on the team, computes:
  1. `Total = (TeamSprintPlan.workingDays − CapacityEntry.leaveDays) × 8`
  2. `effectiveDays = Total / 8`
  3. `Available` = matching `CapacityLookup` row for `(effectivePercentage, effectiveDays)` if one exists, else `Total × (effectivePercentage / 100)`
  4. `Planned` = sum of Effort (ticket 13, via `services/ticketSync.ts`'s `computeEffortHours`) across that team+sprint's `SprintPlanEntry` list whose ticket's *current* assignee matches this person
  5. `Remaining = Available − Planned`

  `effectivePercentage = capacityPercentOverride ?? ROLE_DEFAULT_CAPACITY_PERCENT[role]`. 8 hours/day is a hardcoded constant. Steps 1-3/5 are a pure, separately-unit-tested function (`services/capacityFormula.ts`); 404s if no `TeamSprintPlan` has been entered yet for the sprint. Entirely read-only towards Jira — only touches already-cached `Ticket`/`SprintPlanEntry` data.
- [x] Backend tests reconcile at least the reference spreadsheet's worked example (a 10-day sprint, 1 day of personal leave → `Total = 72`) and cover: the `CapacityLookup` hit vs. fallback-formula paths, zero-leave/zero-override defaults, and `Planned` correctly summing only tickets whose *current* assignee (not whoever added them) matches.
