# 02 — Row structure: mixed or split Dev/QA sub-rows

Type: grilling
Status: resolved

## Question

Should each person get a **single** Gantt row mixing their Dev-role and QA-role ticket placements together (e.g. sorted by computed start date), or **two sub-rows** per person — one for Dev placements, one for QA placements?

Context: a person can appear in both the `devOrder` and `qaOrder` namespaces across different Split tickets (`SprintPlanEntry.devQa`), and these are independent per-role rank namespaces today. Consider:
- How `PlanningView.tsx` currently visualizes a person's Dev-role vs QA-role ticket lists (are they already visually separated?).
- Which framing better matches "person-wise view" as the user described it.
- How this choice affects Ticket 04's placement-algorithm cursor: one walk-forward cursor per person, or one per person-per-role (since Dev and QA work for the same person may need to happen concurrently, not sequentially, if they're separate capacity pools).

## Answer

**Single row per person.** Dev-role and QA-role placements for the same person merge into one row, sorted by computed start date — matching the Planning sheet's existing precedent, which already merges a person's Dev/QA placements into one interleaved, drag-reorderable list via a shared row-wide index space across `order`/`devOrder`/`qaOrder` (`PlanningView.tsx:80-100`, `:1082-1147`). There is no existing visual separation between a person's Dev and QA work to preserve.

This is also supported by the underlying capacity model: `SprintCapacity` has a single `effectivePercentage` per person (`types.ts:378-389`) — no separate dev-capacity-pool vs qa-capacity-pool.

Confirmed with the user: in practice, one person does not work as both dev and qa, so the "same person needs concurrent Dev+QA bars" scenario this question worried about doesn't really arise — but the single-row structure holds regardless, since it's simply the correct shape for a per-person capacity pool.

**Consequence for Ticket 04**: the placement algorithm uses **one walk-forward cursor per person** (not per person-per-role).
