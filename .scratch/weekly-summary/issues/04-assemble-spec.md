# Assemble weekly-summary spec.md

Type: task
Status: resolved

Blocked by: 01, 02, 03

## Question

No open decision remains at this point — assemble `.scratch/weekly-summary/spec.md` (following this repo's spec conventions, see other `.scratch/*/spec.md` files for shape) from the resolved tickets and the map's settled Notes: parsing algorithm and edge cases, bucket definitions, `completedAt` data-model change, the compute-strategy decision, the API contract, and the UI/entry-point design (linking the prototype asset). This is the destination artifact — ready to hand to a separate implementation effort.

## Answer

Assembled `.scratch/weekly-summary/spec.md`, following the `boards/spec.md` wayfinder-synthesized shape (Problem Statement → Domain rules & parsing algorithm → Data Model → Compute strategy → API surface → UI/UX → Out of scope → Further notes/deferred ideas → Primary sources). Pulled directly from the three resolved tickets plus the map's settled Notes, with no new decisions made — `completedAt` field + toggle-route wiring, the segment-parsing rule and bucket definitions, the on-demand compute-strategy research verdict, the full `GET /api/todos/weekly-summary` request/response contract, and the Variant A UI design (4th tab, category cards, week nav), plus pointers to both throwaway branches (`research/weekly-summary-compute-strategy`, `prototype/weekly-summary-view`) as primary sources. Status set to `ready-for-agent` — this is the destination artifact, ready to hand to a separate implementation effort.
