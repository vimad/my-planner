# 18 — Planning view: capacity strip + ticket table

**What to build:** The core of the Planning view — per-person capacity cards and the "Tickets by person" table, driven by real synced data (no drag-reorder yet — that's ticket 19). Demoable: select a team+sprint, type a ticket number into "Add to plan", watch it appear as a badge under the right person's row, and see that person's capacity card update. See `.scratch/sprint-jira-integration/spec.md` ("Planning view UI"); prior art on branch `prototype/sprint-planning-view-variants` (`packages/frontend/src/prototype-views/sprint-planning/`).

**Blocked by:** 14 — Capacity: models + formula + API; 16 — Sprint navigation shell.

**Status:** ready-for-human

- [x] `/sprint/:teamSlug/planning` renders a sprint selector (from `GET /api/sprints?teamId=`) and, once a sprint is chosen, the rest of this view.
- [x] Capacity strip: a horizontal row of compact per-person cards (role, a planned/available progress bar, remaining hours, leave days) sourced from `GET /api/teams/:teamId/sprints/:sprintId/capacity` (ticket 14). Follow `docs/ui-conventions.md` for card styling.
- [x] "Add to plan" bar: a single `WOSMVP-<input>` field; submitting calls `POST /api/sprint-plan-entries` (ticket 13) and shows Full-sync loading/error feedback.
- [x] "Tickets by person" table: one row per `TeamMembership` on the team, that person's `SprintPlanEntry`-linked tickets rendered as small ticket-number badges (ordered by `SprintPlanEntry.order` for now, read-only — drag added in ticket 19). Each badge shows enough to identify the ticket (key, maybe a type/stream indicator) per the winning prototype variant.
- [x] Unmapped-assignee row: any synced ticket in the plan whose `assigneeAccountId` doesn't match a current `TeamMembership` gets the same row shape, appended at the bottom of the table, flagged (amber per the prototype).
- [x] Frontend tests cover: adding a ticket populates the right person's row, capacity cards reflect the API's numbers, and an assignee not on the team lands in the flagged unmapped row.

## Comments

Implemented per checklist above. Entirely read-only towards Jira — every request this view makes either reads already-cached Mongo data (sprints/memberships/capacity/entries) or triggers the existing Full-sync flow (ticket 13's `POST /api/sprint-plan-entries`), which is itself a read from Jira, never a write. Notes for whoever picks up ticket 19/20/22:

- **Gap not covered by any ticket**: nothing in the spec/map ever builds a UI for entering `TeamSprintPlan.workingDays` (ticket 14's capacity endpoint 404s until one exists for a sprint). Without it the capacity strip could never render for a real sprint, so a minimal inline "set working days" form was added here (shown in place of the capacity strip whenever the capacity endpoint 404s, `PlanningView.tsx`'s `WorkingDaysForm`), scoped to just unblocking this ticket's own demoability. If a dedicated settings view for this ever gets built, this inline form can be superseded/removed.
- Ticket badges are static (non-draggable) pills for now — drag-and-drop reordering is ticket 19, which will need to swap `TicketBadge`/`PersonRow` in `PlanningView.tsx` for a `@dnd-kit` sortable version per-row.
- No epics strip and no "Sync plan" button on this view yet — both explicitly out of scope here (tickets 20 and 19 respectively).
- `useSprintPlan.ts` auto-selects the active sprint (falling back to the first) whenever the previously-selected sprint id isn't in the freshly-fetched list — covers both first load and a team switch, since a different team's sprint ids never collide with the stale selection.
