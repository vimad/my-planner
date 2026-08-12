# 10 — Sprint date-range-change reconciliation

**What to build:** Read-time reconciliation for Gantt start-date overrides when a team's sprint `startDate`/`endDate`/`holidays` change after those overrides were saved — mirroring the existing `reconcileWithWorkingDates` precedent (`services/leaveEntries.ts`, applied to `leaveEntries` in `routes/capacity.ts`), but with different resolution behavior since the domain differs (see Ticket 06's answer for the full reasoning).

Add a small new pure helper alongside `computeWorkingDates` (`services/sprintWorkingDays.ts`) that clamps a date forward to the next valid working day within a given `(startDate, endDate, holidays)` calendar. Apply it in `GET /api/sprint-plan-entries` to each entry's `ganttStartDate`/`devGanttStartDate`/`qaGanttStartDate` before returning:

- An override that now falls on a day that's newly a holiday, or before a sprint start that moved later — **clamp forward** to the next valid working day, silently, no visual warning (consistent with the app's autosave/no-confirmation conventions elsewhere).
- An override that now falls after a narrowed `endDate` — **left untouched**. This is not an error state: the map's Decided section already treats a bar past `endDate` as a supported spillover view (axis extends rather than clips), so narrowing `endDate` just means more overrides now sit in that already-expected zone.

Reconciliation is read-time only, same as `leaveEntries` — it never writes the clamped value back to storage.

**Blocked by:** 09.

**Status:** ready-for-agent

- [ ] A pure "clamp to next working day" helper exists alongside `computeWorkingDates`
- [ ] `GET /api/sprint-plan-entries` applies it to `ganttStartDate`/`devGanttStartDate`/`qaGanttStartDate` before returning, using the sprint's current `TeamSprintPlan` calendar
- [ ] An override now landing on a newly-added holiday is returned clamped forward to the next working day
- [ ] An override now before a sprint start that moved later is returned clamped forward to the next working day
- [ ] An override now after a narrowed `endDate` is returned unchanged
- [ ] Reconciliation never mutates the stored `SprintPlanEntry` document — read-time only
