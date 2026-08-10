# 20 — Epics pill strip + detail modal

**What to build:** The active-epics list for the selected sprint, surfaced on the Planning view. Demoable: see a pill strip of the sprint's active epics with a done/total rollup, click one, see a modal with its detail. See `.scratch/sprint-jira-integration/spec.md` ("Planning view UI"); prior art on branch `prototype/sprint-planning-view-variants`.

**Blocked by:** 13 — Sprint, Ticket, Epic & SprintPlanEntry: models + Full sync + Planning API; 18 — Planning view: capacity strip + ticket table.

**Status:** ready-for-agent

- [ ] A horizontal pill strip on the Planning view, one pill per active epic for the selected sprint (title + done/total child-ticket rollup), sourced from `GET /api/epics?sprintId=` (ticket 13).
- [ ] Clicking a pill opens a full modal (ui-conventions archetype B) with a stub detail view — phase 1 shows whatever fields `Epic`/rollup already provide; a real deep-link-to-Jira affordance is included (opens the epic in a new tab) even though full detail fetch is out of scope here.
- [ ] Frontend tests cover: the pill strip rendering the right rollup counts and the modal opening/closing with the right epic's data.
