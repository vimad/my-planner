# 18 — Planning view: capacity strip + ticket table

**What to build:** The core of the Planning view — per-person capacity cards and the "Tickets by person" table, driven by real synced data (no drag-reorder yet — that's ticket 19). Demoable: select a team+sprint, type a ticket number into "Add to plan", watch it appear as a badge under the right person's row, and see that person's capacity card update. See `.scratch/sprint-jira-integration/spec.md` ("Planning view UI"); prior art on branch `prototype/sprint-planning-view-variants` (`packages/frontend/src/prototype-views/sprint-planning/`).

**Blocked by:** 14 — Capacity: models + formula + API; 16 — Sprint navigation shell.

**Status:** ready-for-agent

- [ ] `/sprint/:teamSlug/planning` renders a sprint selector (from `GET /api/sprints?teamId=`) and, once a sprint is chosen, the rest of this view.
- [ ] Capacity strip: a horizontal row of compact per-person cards (role, a planned/available progress bar, remaining hours, leave days) sourced from `GET /api/teams/:teamId/sprints/:sprintId/capacity` (ticket 14). Follow `docs/ui-conventions.md` for card styling.
- [ ] "Add to plan" bar: a single `WOSMVP-<input>` field; submitting calls `POST /api/sprint-plan-entries` (ticket 13) and shows Full-sync loading/error feedback.
- [ ] "Tickets by person" table: one row per `TeamMembership` on the team, that person's `SprintPlanEntry`-linked tickets rendered as small ticket-number badges (ordered by `SprintPlanEntry.order` for now, read-only — drag added in ticket 19). Each badge shows enough to identify the ticket (key, maybe a type/stream indicator) per the winning prototype variant.
- [ ] Unmapped-assignee row: any synced ticket in the plan whose `assigneeAccountId` doesn't match a current `TeamMembership` gets the same row shape, appended at the bottom of the table, flagged (amber per the prototype).
- [ ] Frontend tests cover: adding a ticket populates the right person's row, capacity cards reflect the API's numbers, and an assignee not on the team lands in the flagged unmapped row.
