# Sprint Planning Gantt Chart — map

## Destination

A finished **spec** for the Sprint Planning Gantt Chart feature: a "Gantt chart" button placed before the Resync ("Sync plan") button in `PlanningView.tsx`'s "Tickets by person" header, opening a large popup with a **person-wise timeline** of the current sprint — ticket bars (including visually-linked Dev/QA split-ticket bars) plus read-only leave/holiday shading. Tickets initially auto-lay-out back-to-back in planning-sheet order, skipping non-working days; the user can drag a bar to change its start date or open a gap, which persists per-ticket-placement independently of the planning sheet. This map ends in a spec ready to hand to an implementation session — no application code is written while resolving these tickets (except throwaway prototype code, which is discarded/linked as an asset, not shipped).

## Notes

**Grounding facts** (from exploration, not decisions — re-verify if stale):
- Resync button lives at `packages/frontend/src/components/PlanningView.tsx:1258-1265`, in the "Tickets by person" card header — the new Gantt button goes in the same `<div className="flex items-center gap-2">` before `<SyncPlanButton>`.
- "Current sprint" = whatever `selectedSprintId` (from `useSprintPlan`) currently is — not a route param, defaults to Jira's `state === 'active'` sprint but user-switchable via `SprintSelect`. The Gantt button already has `selectedSprintId`, `teamId`, `entries`, `capacity`, `memberships` in scope.
- Key types: `Ticket` (`types.ts:216`), `SprintPlanEntry` (`types.ts:267`, has `order`/`devOrder`/`qaOrder`/`devQa`), `TeamSprintPlan` (`types.ts:347`, has `startDate?`/`endDate?`/`holidays`/`workingDays`), `SprintCapacity`/`LeaveEntry` (`types.ts:378`/`364`). **No ticket start/end date field exists anywhere** — bar placement is entirely computed by my-planner.
- Capacity/leave/holiday/extraHours all come from one endpoint: `GET /api/teams/:teamId/sprints/:sprintId/capacity` (`packages/backend/src/routes/capacity.ts:31`), which reconciles stored `leaveEntries` against `computeWorkingDates(startDate, endDate, holidays)` **on read**, never mutating storage — this is the precedent for how Gantt start-date overrides should reconcile too.
- `SprintLeaveGrid.tsx` is the existing leave/holiday UI (full=red-400/500, half=amber-300/500, none=slate, non-writable columns dimmed) — the Gantt's leave shading should reuse this exact vocabulary for visual consistency, and stays **read-only** on the Gantt (leave editing continues to happen only in the Leave grid).
- Row-reorder precedent: `@dnd-kit` (`SortableContext`/`useSortable`/`arrayMove`), drag-handle-only (not whole row), `computeReorderPatches` (`PlanningView.tsx:101`) diffs and persists via `reorderEntries` → one `PATCH /api/sprint-plan-entries/:id` per changed placement. Follow this pattern for the Gantt's own drag interaction and its order write-back.
- **No existing "saved view" / UI-preferences model anywhere in the codebase** — the persistence model for Gantt overrides is new, no precedent to reuse beyond the leave-entry reconcile-on-read pattern above.
- Split tickets: one Jira ticket (`entry.ticketId.jiraKey`), up to two independent placements — `PlacedEntry {entry, role: 'dev'|'qa'}`, keyed by `placementKey = \`${entryId}-${role ?? 'main'}\``, each with its own order field, estimate, and resolved assignee (`devQa.dev`/`devQa.qa`, each `resolved|unmapped|needs-assignment`). Dev and QA placements for the same ticket can land on **different people's rows**.
- Library research already done: `.scratch/sprint-gantt-chart/research/gantt-library-selection.md`. Primary pick: **SVAR React Gantt, open-source (`@svar-ui/react-gantt`)** — MIT, actively maintained, native React, confirmed free-tier row drag-reorder. Known gaps needing verification: per-resource leave shading is nominally PRO-gated (but this app only needs to *render* pre-computed shading, not run a scheduling engine — plausible workaround per the research's §0); **Dev/QA bar linking is unconfirmed in every library evaluated, SVAR included** — now a hard v1 requirement (see Decided below), making this the top-priority open question. Fallback pick if SVAR can't clear the bar: `frappe-gantt` (MIT, most popular, no React binding — hand-roll a wrapper; no in-chart row drag — reuse the `@dnd-kit` pattern instead).

**Decided during destination-naming** (standing constraints for every ticket below — do not re-litigate):
- No extra-hours bars, no placeholders on the Gantt (see Out of scope).
- Persistence = a **start-date override per ticket-placement**, reconciled on read (mirrors `leaveEntries`/`reconcileWithWorkingDates`) — not a frozen snapshot. Tickets without a saved override auto-place; new tickets added to the plan since the last save auto-place too; removed tickets' overrides are simply dropped on read.
- Bar duration/placement is computed by walking each person's **working days only** — skipping leave/holiday days, honoring `effectivePercentage` — never naive calendar-day math.
- A Split ticket's Dev bar and QA bar **must** be visually linked/highlighted as the same ticket in v1 — not deferrable, even though the research doc flagged this as unresolved everywhere including the primary pick.
- Dragging a bar is **time-axis-only** — no cross-row drag, no reassignment via the Gantt. Assignee changes remain a Planning-sheet action.
- Dragging writes back to the Planning sheet's `order`/`devOrder`/`qaOrder` (one-directional: Gantt edits → Planning order sync via the existing `reorderEntries`/patch pattern). Planning-sheet reorders, conversely, no longer move a bar that already has a saved start-date override — that's what makes the Gantt view "independent" once touched.
- Overlapping bars on the same row are allowed freely — no auto-collision/auto-push logic.
- Autosave on drop — no separate Save button/state, consistent with the Leave grid and Planning reorder conventions.
- The date axis extends past the sprint's `endDate` to visualize spillover hours (`spillHours`/`devSpillHours`/`qaSpillHours`) rather than clipping.

**Skills to consult while resolving tickets**: `/grilling` + `/domain-modeling` for the grilling tickets; `/prototype` for the prototype ticket. Check `docs/ui-conventions.md` before deciding any visual styling (bar colors, modal chrome, etc.) — copy the existing dropdown/modal/card convention rather than inventing new values.

**Map status: ready for handoff.** All six tickets are resolved; the frontier is empty. The four items still in Not yet specified below were deliberately left unticketed — the user chose to hand this off as-is rather than keep charting, treating them as implementation/prototyping-time judgment calls rather than pre-decided answers.

## Decisions so far

- [01 — SVAR Gantt feasibility prototype](issues/01-svar-feasibility-prototype.md) — SVAR React Gantt (open-source) confirmed viable on all four fronts: per-row leave shading via sibling tasks (not the PRO calendar), Dev/QA bar linking via a native dependency link *and* `data-id`-keyed CSS (no fallback library needed), drag read-back via `update-task`/`api.getTask`, and a widened Archetype-B modal (`max-w-6xl`, capped height). Key new finding: SVAR's "resource planning"/"task grouping" are PRO-gated too (not just the calendar) — rows-per-person must be built as a synthetic parent/child task tree, not SVAR resources.
- [02 — Row structure: mixed or split Dev/QA sub-rows](issues/02-row-structure.md) — Single row per person, mixing Dev/QA placements sorted by computed start date (matches the Planning sheet's existing merged-order precedent and the single-capacity-pool-per-person model). Ticket 04's placement algorithm uses one walk-forward cursor per person, not per person-per-role.
- [03 — Unassigned / unresolved-role ticket handling](issues/03-unassigned-handling.md) — Excluded entirely from the Gantt's initial render (no pseudo-row, no bar) — stays visible only via the Planning sheet's existing Unmapped/Needs-dev/qa rows. Ticket 04's placement algorithm never needs a "no capacity data" branch.
- [04 — Bar placement algorithm spec](issues/04-bar-placement-algorithm.md) — One walk-forward cursor per person, sized by `plannedHours` (not raw estimate); flat per-day rate `8 × effectivePercentage/100`, zeroed on leave/holiday, halved on half-leave (CapacityLookup exceptions not decomposed per day); an existing override makes the cursor jump to `max(cursor, override.end)` before continuing later auto-placements; computed entirely frontend-side.
- [05 — Persistence data model & API contract](issues/05-persistence-data-model.md) — Embed on `SprintPlanEntry` (mirrors its existing Plan/Spill nullable-field pattern): new `ganttStartDate`/`devGanttStartDate`/`qaGanttStartDate` fields, `'YYYY-MM-DD'` string or `null`. Extends the existing `PATCH /api/sprint-plan-entries/:id` (no new/bulk endpoint), accepts explicit `null` to clear an override; a drag emits one PATCH per changed placement, mirroring `computeReorderPatches`.
- [06 — Sprint date-range-change reconciliation](issues/06-sprint-date-change-reconciliation.md) — An override on a now-invalid day (before the new `startDate`, or a newly-added holiday) clamps forward to the next valid working day on read, silently — deliberately not mirroring `leaveEntries`' drop precedent. An override past a narrowed `endDate` is left as-is (already a supported spillover state).

## Not yet specified

- Exact visual styling for bars (color by ticket type/status/stream?) and leave/holiday shading placement relative to bars, beyond "reuse the Leave grid's color vocabulary" — will sharpen once the prototype ticket (Ticket 01) has something concrete to react to.
- Time-axis scale/zoom for longer or shorter sprints (fixed day-column width vs a horizontal-scroll/zoom control) — deferred until the prototype has rendered real sprint data.
- Error/retry UX when an autosaved drag fails to persist (network failure, stale entry, etc.) — not yet sharp enough to ticket.
- UI affordance for clearing a start-date override back to auto-placement (right-click? a reset icon on the bar? something else?) — the API contract already supports it (Ticket 05: `PATCH` accepts explicit `null`), but the trigger itself is a UI-implementation detail, not yet sharp enough to ticket.

## Out of scope

- **Extra hours bars on the Gantt** — explicitly ruled out by the user; extra hours stay editable only in `SprintLeaveGrid`. Not a closed ticket (never ticketed), recorded here directly per the destination-naming session.
- **Placeholders (generic non-ticket time blocks)** — explicitly ruled out by the user as unnecessary complexity for v1. Not ticketed.
- **Cross-row drag / reassigning a ticket's assignee via the Gantt** — ruled out; assignee changes stay a Planning-sheet-only action.
- **Multi-sprint / roadmap view** — destination is scoped to "the Gantt chart of current sprint" only, not a cross-sprint planning tool.
