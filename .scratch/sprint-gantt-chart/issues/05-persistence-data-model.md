# 05 — Persistence data model & API contract

Type: grilling
Status: open
Blocked by: 04

## Question

Design the persistence model and API contract for per-ticket-placement start-date overrides:

- New Mongoose collection vs. embedding on an existing document (e.g. a new array on `TeamSprintPlan`) — weigh against the fact there's no existing "saved view" precedent anywhere in this codebase (see map Notes).
- Exact schema: how a placement is keyed (mirroring `placementKey = \`${entryId}-${role ?? 'main'}\`` from `PlanningView.tsx`), what a stored override holds (just a `startDate`? anything else?).
- REST endpoint shape: one PATCH per drag (mirroring the existing `PATCH /api/sprint-plan-entries/:id` reorder pattern), or a bulk endpoint.
- How this composes with the order write-back decided on the map: does a single drag-drop trigger two API calls (one for the start-date override, one via the existing `reorderEntries`), or should these be combined into one new endpoint?
- New TypeScript types needed in `types.ts`, and their shape.

Depends on Ticket 04's placement algorithm to know exactly what "override" needs to encode.
