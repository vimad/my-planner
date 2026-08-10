# 20 — Epics pill strip + detail modal

**What to build:** The active-epics list for the selected sprint, surfaced on the Planning view. Demoable: see a pill strip of the sprint's active epics with a done/total rollup, click one, see a modal with its detail. See `.scratch/sprint-jira-integration/spec.md` ("Planning view UI"); prior art on branch `prototype/sprint-planning-view-variants`.

**Blocked by:** 13 — Sprint, Ticket, Epic & SprintPlanEntry: models + Full sync + Planning API; 18 — Planning view: capacity strip + ticket table.

**Status:** ready-for-human

- [x] A horizontal pill strip on the Planning view, one pill per active epic for the selected sprint (title + done/total child-ticket rollup), sourced from `GET /api/epics?sprintId=` (ticket 13).
- [x] Clicking a pill opens a full modal (ui-conventions archetype B) with a stub detail view — phase 1 shows whatever fields `Epic`/rollup already provide; a real deep-link-to-Jira affordance is included (opens the epic in a new tab) even though full detail fetch is out of scope here.
- [x] Frontend tests cover: the pill strip rendering the right rollup counts and the modal opening/closing with the right epic's data.

## Comments

Implemented per spec.

**What was built:**
- `packages/frontend/src/hooks/useEpics.ts` — new hook, `GET /api/epics?sprintId=` (ticket 13), independent loading/error lifecycle mirroring `useSprintPlan`'s per-fetch convention.
- `packages/frontend/src/components/EpicPillStrip.tsx` — the pill strip (title + done/total rollup) plus the archetype-B `EpicModal` (jiraKey/title/status/rollup, an "Open in Jira ↗" link, and Close). Self-contained: owns its own `selectedEpic` state so `PlanningView` just passes `epics`/`loading`/`error` through.
- `packages/frontend/src/components/PlanningView.tsx` — wired `useEpics(selectedSprintId)` + `<EpicPillStrip>` in above the capacity strip, matching the winning prototype variant's layout.
- `packages/frontend/src/types.ts` — added the `Epic` type (mirrors `GET /api/epics`'s `{...epic, childCount, doneCount}` response shape).
- Jira deep-link base URL: added `VITE_JIRA_BASE_URL` (frontend `.env`/`.env.example`), mirroring the existing `VITE_API_URL` convention, defaulting to `https://wealthos.atlassian.net` — the frontend has no access to the backend's `JIRA_BASE_URL` env at build time.
- Tests: `EpicPillStrip.test.tsx` (loading/error/empty states, rollup rendering, modal open-with-correct-data/close) plus one wiring test added to `PlanningView.test.tsx` confirming the strip is sourced from the real `GET /api/epics?sprintId=` call.

Full `pnpm test` (typecheck + backend + frontend, 721 tests) passes.
