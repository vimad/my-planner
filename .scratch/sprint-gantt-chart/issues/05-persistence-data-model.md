# 05 — Persistence data model & API contract

Type: grilling
Status: resolved
Blocked by: 04

## Question

Design the persistence model and API contract for per-ticket-placement start-date overrides:

- New Mongoose collection vs. embedding on an existing document (e.g. a new array on `TeamSprintPlan`) — weigh against the fact there's no existing "saved view" precedent anywhere in this codebase (see map Notes).
- Exact schema: how a placement is keyed (mirroring `placementKey = \`${entryId}-${role ?? 'main'}\`` from `PlanningView.tsx`), what a stored override holds (just a `startDate`? anything else?).
- REST endpoint shape: one PATCH per drag (mirroring the existing `PATCH /api/sprint-plan-entries/:id` reorder pattern), or a bulk endpoint.
- How this composes with the order write-back decided on the map: does a single drag-drop trigger two API calls (one for the start-date override, one via the existing `reorderEntries`), or should these be combined into one new endpoint?
- New TypeScript types needed in `types.ts`, and their shape.

Depends on Ticket 04's placement algorithm to know exactly what "override" needs to encode.

## Answer

**Storage: embed on `SprintPlanEntry`, not a new collection.** `SprintPlanEntry` already carries exactly this shape for the analogous Plan/Spill override — `devPlanHours`/`devSpillHours`/`qaPlanHours`/`qaSpillHours` (Split) and `planHours`/`spillHours` (non-split), nullable, `null` meaning "not overridden" (`SprintPlanEntry.ts:26-38`). Add three new nullable fields following the identical pattern:
- `ganttStartDate: string | null` (non-split placement)
- `devGanttStartDate: string | null` / `qaGanttStartDate: string | null` (Split placement's two roles)
- Each holds just a `'YYYY-MM-DD'` string (same date-string convention as `TeamSprintPlan.startDate`/`LeaveEntry.date` — never a `Date` object). No separate end/duration field — Ticket 04 already established a bar's end is always derived at render time from the start plus that person's day-by-day `plannedHours` walk, never stored.

This gets the map's "removed tickets' overrides are simply dropped on read" decision for free: deleting a `SprintPlanEntry` (already how removing a ticket from the plan works, `DELETE /api/sprint-plan-entries/:id`) deletes the override with it — no extra reconciliation code needed. A separate collection would need its own keying scheme mirroring `placementKey` and its own cleanup-on-removal logic for no benefit.

**Endpoint: extend the existing `PATCH /api/sprint-plan-entries/:id`.** Not a new endpoint, not a bulk endpoint. Add three more optional flat top-level fields to the body — `ganttStartDate?`, `devGanttStartDate?`, `qaGanttStartDate?` — alongside the existing `order`/`devOrder`/`qaOrder` (flat, not nested as a `{planHours, spillHours}`-style pair, since a start-date override is a single value).

**Clearing an override**: the endpoint's contract explicitly accepts `null` as a valid value for these three fields (clears the override, resumes auto-placement) — unlike `order`/`devOrder`/`qaOrder` today, which reject non-numbers. This is deliberately narrow: only the API-level capability is decided here. The UI affordance for *triggering* a clear (right-click, a reset icon on the bar, etc.) is left open — a UI-affordance detail for the prototype/implementation stage, not a persistence decision. Recorded in the map's Not yet specified.

**Drag write-back composition: not a combined new endpoint.** A single drag emits potentially multiple PATCH calls, mirroring the existing `computeReorderPatches` "one PATCH per changed placement" pattern (`PlanningView.tsx:101-110`):
- The **dragged** entry's own PATCH bundles both its new start-date override *and* its own order-field update in one request body (both target the same entryId, and the endpoint already accepts multiple optional fields at once).
- Any **sibling** entries in that row whose derived order shifted as a side effect (per Ticket 04's "re-derive order from the sort of new start dates" answer) get their own order-only PATCH each — unchanged shape from what `reorderEntries` already does today.

**New TS types**: extend the existing `SprintPlanEntry` interface (`types.ts:267`) with the same three nullable fields (`ganttStartDate`, `devGanttStartDate`, `qaGanttStartDate`). No new interface needed — `PlacedEntry` (already in `PlanningView.tsx`) just reads whichever field matches its role.
