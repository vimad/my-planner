# 02 — Leave & rolling two-week holiday tracking

**What to build:** Inside the Planning tab, a leave grid and a shared holiday-chip row, both scoped to a window that is always "today through the next 13 days" — recomputed on every load, never a manually picked period. The leave grid has one row per roster member and one column per day in the window; clicking a cell cycles none → full → half. The holiday chips are a single row of the same 14 dates, toggled on/off, shared across the whole roster (not per person). Marks persist by absolute date, so a mark made yesterday for a date still inside today's window keeps showing correctly; a date that rolls out of the window simply stops being shown/editable — nothing is deleted or archived when it ages out.

**Blocked by:** 01 (shares the Planning tab's layout and roster context).

- [ ] New backend collection (working name `AtlasPlanningLeave`): `{ rosterMemberId, date, portion: 'full' | 'half' }`, unique per `(rosterMemberId, date)`.
- [ ] New backend collection (working name `AtlasPlanningHoliday`): `{ date }`, unique per date.
- [ ] New route files (`atlasPlanningLeave`, `atlasPlanningHolidays`) mounted flat off `/api/...`, following the same REST conventions as ticket 01's route (flat `{ error }`, `next(err)`, manual validation, raw docs on success).
- [ ] A shared rolling-window utility computes `[today, today + 13 days]` at read time — used identically by the leave grid, holiday chips, and (in ticket 03) the Gantt chart, so none of them can drift out of sync with each other. Not persisted anywhere as a stored "period."
- [ ] Leave grid UI: click-to-cycle interaction per cell, same shape as Sprint Planning's `SprintLeaveGrid` (fresh implementation, not shared).
- [ ] Holiday chip row UI: toggle-on/off per date, same shape as `SprintPeriodForm`'s holiday chips (fresh implementation, not shared).
- [ ] A leave/holiday date outside the current window is not rendered and not editable; no cleanup job or archive step is needed when a date ages out (matches `CapacityEntry`'s existing "reconcile at read time" convention).
- [ ] Backend route tests for both new route files under `packages/backend/test/`, mocking the relevant models.
- [ ] A co-located `*.test.ts` for the rolling-window utility (prior art: `sprintExport.test.ts`, `ganttPlacement.test.ts` for co-location convention).
- [ ] Co-located component tests for the leave grid's click-cycle behavior and the holiday chips' toggle behavior.
