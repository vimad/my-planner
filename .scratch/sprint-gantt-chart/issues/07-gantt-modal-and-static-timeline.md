# 07 — Gantt button, modal, and read-only auto-placed timeline

**What to build:** A "Gantt chart" button in `PlanningView.tsx`'s "Tickets by person" header, placed before the Resync ("Sync plan") button, opening a large modal that renders a person-wise timeline of the current sprint using `@svar-ui/react-gantt` (open-source edition, confirmed viable in `.scratch/sprint-gantt-chart/issues/01-svar-feasibility-prototype.md`). One row per team member (built as a synthetic parent/child task tree — SVAR's own "resource planning"/"task grouping" are PRO-gated, so rows-per-person are NOT SVAR resources, see Ticket 01's API-specifics notes), with each person's Dev-role and QA-role ticket placements merged into that single row (Ticket 02), sorted by computed start date. Ticket bars are placed by the Ticket 04 walk-forward algorithm: one cursor per person, sized by `plannedHours` (not raw estimate), walking working days only at a flat `8 × effectivePercentage / 100` daily rate (zeroed on holiday/full-leave, halved on half-leave), in planning-sheet order. Placements with no resolved assignee (Unmapped / Needs dev/qa) never appear on the Gantt (Ticket 03). The date axis extends past the sprint's `endDate` rather than clipping, so spillover is visible.

This ticket is intentionally static: no drag interactivity, no leave/holiday shading, no persistence. It establishes the SVAR integration, the synthetic row structure, and the placement algorithm as a correct, demoable read-only picture of the sprint — everything later tickets build on.

Write the placement algorithm as a pure function that accepts an optional per-placement override start date as an input parameter (not read directly off `SprintPlanEntry`, since that field doesn't exist until Ticket 09) — always absent for now, so the algorithm always takes its auto-placement branch, but the override branch (cursor jumps to `max(cursor, override.end)` and continues) should already be implemented per Ticket 04's answer, ready for Ticket 09 to wire real data into.

Modal container: a widened variant of `docs/ui-conventions.md`'s Archetype B (full modal dialog) — `max-w-6xl` instead of the base `max-w-sm`, plus `max-h-[90vh] overflow-hidden` on the card with `overflow-auto` on the inner content (the base archetype has no height cap since its dialogs are always short). Worth documenting this as a named "large modal" variant in `docs/ui-conventions.md` rather than a one-off.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] "Gantt chart" button appears in the "Tickets by person" header, before `SyncPlanButton`
- [ ] Clicking it opens a modal (`max-w-6xl`, capped height, scroll-contained content) rendering the SVAR Gantt
- [ ] One row per current `TeamMembership`; a person's Dev-role and QA-role placements merge into that one row, sorted by computed start date
- [ ] Placements with no resolved assignee (Unmapped, Needs dev/qa) never appear
- [ ] Each bar's duration is sized from `plannedHours`/`devPlannedHours`/`qaPlannedHours`, not raw estimate
- [ ] Bars are placed walking working days only (skip weekends/holidays), honoring `effectivePercentage`, with correct half-leave handling
- [ ] The placement function accepts a per-placement override-start-date parameter and implements the override-aware cursor-continuation branch, even though nothing supplies a real override value yet
- [ ] Axis extends past the sprint's `endDate` rather than clipping when total planned work exceeds available working days
