# 09 — Drag-to-reschedule with persistence

**What to build:** The backend persistence contract (Ticket 05) and the frontend drag interaction that uses it, so a user can drag a bar to a new start date (or open a gap) and have that placement stay put independently of the planning sheet from then on.

**Backend:**
- Add three nullable fields to `SprintPlanEntry` (schema + `types.ts`), mirroring its existing Plan/Spill nullable-field pattern: `ganttStartDate: string | null` (non-split), `devGanttStartDate: string | null` / `qaGanttStartDate: string | null` (Split's two roles). Each holds a plain `'YYYY-MM-DD'` string, never a `Date` — same convention as `TeamSprintPlan.startDate`/`LeaveEntry.date`. No end/duration field — a bar's end is always derived at render time from Ticket 04's algorithm.
- Extend the existing `PATCH /api/sprint-plan-entries/:id` with three more optional flat body fields — `ganttStartDate?`, `devGanttStartDate?`, `qaGanttStartDate?` — following the same only-touch-what's-present convention already used for `order`/`devOrder`/`qaOrder`. Unlike those numeric fields, these three must also accept an explicit `null` (to clear an override and resume auto-placement) — the exact UI trigger for sending that `null` is left open (noted in the map's fog), but the API contract supports it now.
- No new endpoint, no bulk endpoint.

**Frontend:**
- Dragging a bar's body updates its task via SVAR's `update-task` event / `api.getTask` readback (confirmed working in Ticket 01's prototype), autosaves on drop with no separate Save button/state (consistent with the Leave grid and Planning reorder conventions).
- On drop, Ticket 04's placement algorithm re-runs for that row: the dragged placement's own PATCH bundles both its new `ganttStartDate` (or role equivalent) and its own `order`/`devOrder`/`qaOrder` value in one request. Any not-yet-overridden placement later in that row whose auto-placed start needs to change now resumes immediately after the dragged bar's end (`max(cursor, override.end)`) — if this shifts a sibling's row-relative position, that sibling gets its own order-only PATCH, mirroring `computeReorderPatches`'s existing "one PATCH per changed placement" pattern (`PlanningView.tsx:101`).
- This write-back is one-directional: Gantt edits sync to the Planning sheet's order fields via the existing `reorderEntries`/patch pattern, but a Planning-sheet reorder never moves a placement that already has a saved start-date override — an overridden placement's Gantt position is fixed regardless of what its `order` value says (already implied by Ticket 04's algorithm: an overridden placement is never auto-placed).
- Dragging is time-axis-only — no cross-row drag, no reassignment via the Gantt (already enforced by SVAR's row-grouping structure from Ticket 07, but worth confirming no accidental cross-row drop is possible).

**Blocked by:** 07. (Independent of Ticket 08's visual layer — 08 and 09 can run in parallel.)

**Status:** ready-for-agent

- [ ] `SprintPlanEntry` gains `ganttStartDate`/`devGanttStartDate`/`qaGanttStartDate` (`'YYYY-MM-DD'` string or `null`), schema + `types.ts`
- [ ] `PATCH /api/sprint-plan-entries/:id` accepts these three fields, including explicit `null` to clear
- [ ] Dragging a bar's body persists its new start date on drop, no separate Save action
- [ ] After a drag, later not-yet-overridden placements in that row re-flow starting immediately after the dragged bar's end
- [ ] Any placement whose row-relative order changed as a side effect gets its `order`/`devOrder`/`qaOrder` patched (one PATCH per changed placement)
- [ ] A saved override survives closing/reopening the Gantt modal and a full page reload
- [ ] An overridden placement is never re-auto-placed, even after a Planning-sheet reorder changes its `order` value
- [ ] Dragging cannot move a bar to a different person's row
