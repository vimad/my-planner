# Spec: Sprint Plan/Spill Estimate

**Status:** ready-for-agent

## Problem Statement

Today, Planned capacity always uses a Ticket's raw Jira estimate as-is: a Split ticket's role Planned figure is that role's own `[Dev]`/`[Test]` Sub-task `estimateHours` (`roleSubtaskEstimateHours`), and a non-split ticket's Planned figure is `computeEffortHours` (its own estimate, or the sum of its Sub-tasks'). There's no way to tell the plan "we're only doing part of this ticket's estimate this sprint" or "we're deliberately giving this more room than Jira says." Two real situations this misses:

- **Spill**: a ticket (or one role of it) won't be finished this sprint — e.g. only Dev will complete WOSMVP-14782 this sprint, QA's 2d estimate is being pushed out — but today QA's full 2d still counts against QA capacity, understating how much QA capacity is actually free.
- **Buffer**: a ticket needs more room than its raw estimate this sprint (e.g. a learning buffer for someone newer to the area), but today there's no way to plan for that extra time without editing the Jira estimate itself (which this app is read-only against, per `CLAUDE.md`).

The Planning view currently shows no distinction between "the original Jira number" and "what we're actually counting for this sprint" anywhere — not on the ticket badges, not in either detail popup.

## Solution

Add a per-sprint, per-role **Plan** and **Spill** figure alongside every role's **Original** (read-only Jira) estimate:

- **Original** — read-only, unchanged: a Split ticket's role Sub-task estimate, or a non-split ticket's Effort.
- **Plan** — editable hours, defaults to Original. Free-form: can be lowered (spill) or raised (buffer) independent of Spill.
- **Spill** — editable hours, defaults to 0. Blocked (validation error) from exceeding Plan, since the derived figure below must never go negative.
- **Planned this sprint** (derived, not directly editable) = `Plan − Spill`. This is the number that now feeds the capacity math in place of the raw Original.

This lands **Variant B ("split-bar card")**, the winning variant from a `/prototype` UI session run earlier in this effort (see Further Notes): each role gets a small card showing Original at the top, a split bar visualizing how much of the current Plan is Planned vs. Spilled, the Plan/Spill inputs, and a large "Planned this sprint" hero number. On the board, a ticket badge whose Planned differs from Original gets a colored ring (amber for spilled/reduced, emerald for buffered/increased) — chosen over Variant A's inline flat row and Variant C's collapsed-by-default disclosure.

Applies to **both** Split tickets (Story/Bug — independent Dev and QA trios) and non-split tickets (Task/Sub-task — one trio for the single Effort figure), per the grilling session's scope decision.

## Domain model changes

- **`SprintPlanEntry`** (`packages/backend/src/models/SprintPlanEntry.ts`) gains six nullable hour fields, all defaulting to `null` ("not overridden — follow Original"):
  - `devPlanHours: number | null`, `devSpillHours: number | null` — Split entries' Dev role.
  - `qaPlanHours: number | null`, `qaSpillHours: number | null` — Split entries' QA role.
  - `planHours: number | null`, `spillHours: number | null` — non-split entries' single slot.
  A Split entry only ever uses the `dev*`/`qa*` pair; a non-split entry only ever uses the bare pair — same "the two variants never coexist on the same entry" convention `devQa`/`assigneeOverridePersonId` already follow on this model's GET response. This override is **sprint-scoped on `SprintPlanEntry`**, not a global per-ticket doc like `TicketDevQaOverride`/`TicketAssigneeOverride` — deliberately so, since spill/buffer is a decision about *this* sprint's plan, and a ticket carried into a later sprint (ADR 0002: a `SprintPlanEntry` per team+sprint+ticket) must be able to have an independent Plan/Spill each time.
  - Real database currently has `SprintPlanEntry` documents in use (unlike the leave-picker precedent) — this is a **purely additive** schema change (new optional fields, existing docs read back with all six as `null`, i.e. unchanged "follow Original" behavior), not a breaking one. No migration needed.
- **`CONTEXT.md`**: update the "Total / Available / Planned / Remaining" glossary entry's *Planned* definition to reflect the new formula (see Implementation Decisions, Backend), and add a new glossary entry, **Plan/Spill**, defined roughly as: "A per-sprint, per-role adjustment to a ticket's Original estimate for capacity purposes: Plan (defaults to Original, freely raised or lowered) minus Spill (defaults to 0, capped at Plan) — see [ADR 0006](docs/adr/0006-plan-spill-is-sprint-scoped-not-global.md)." Cross-reference from the existing *Effort*/*Estimate* entries so the three terms (Estimate → Effort → Planned-this-sprint) read as one derivation chain.
- **New ADR 0006** (`docs/adr/0006-plan-spill-is-sprint-scoped-not-global.md`): documents why this override lives on `SprintPlanEntry` (sprint-scoped) rather than following the `TicketDevQaOverride`/`TicketAssigneeOverride` precedent (global, "wins over Jira resync") — Plan/Spill isn't about who Jira says vs. who we say, it's a planning-side adjustment with no Jira equivalent at all, and it must reset to "follow Original" by default in every new sprint a ticket appears in rather than persisting forever.

## Implementation Decisions

### Backend

- **New pure module — `packages/backend/src/services/planSpill.ts`**, sibling to `capacityFormula.ts`/`leaveEntries.ts` (pure, directly unit-testable), promoting the formula validated in the grilling session and the throwaway prototype branch:
  ```ts
  export interface PlanSpillOverride { planHours: number | null; spillHours: number | null }
  export function resolvedPlan(original: number, override: PlanSpillOverride): number {
    return override.planHours ?? original
  }
  export function plannedHours(original: number, override: PlanSpillOverride): number {
    const plan = resolvedPlan(original, override)
    const spill = override.spillHours ?? 0
    return Math.max(0, plan - spill)
  }
  ```
- **`routes/capacity.ts`'s Planned aggregation** switches from the raw Original figure to `plannedHours`, for both branches:
  - Split branch: `roleSubtaskEstimateHours(ticket.jiraKey, 'Dev'/'Test')` still computes Original, but the hours added to `splitPlannedByPersonId` become `plannedHours(original, { planHours: entry.devPlanHours, spillHours: entry.devSpillHours })` (and the QA equivalent) — using the `entry` already in scope from the existing `planEntries` loop, so this needs no new query.
  - Non-split branch: same substitution using `entry.planHours`/`entry.spillHours` against `computeEffortHours(ticket)` as Original.
  - `computeCapacity`/`capacityFormula.ts` itself stays unmodified — same precedent as the leave-picker spec, it keeps taking a plain `planned: number`; only where that number comes from changes.
- **`GET /api/sprint-plan-entries`** response gains the resolved (not just raw-stored) figures so the frontend never has to re-derive the formula itself, alongside the existing `devEstimateHours`/`qaEstimateHours` (which stay as Original, unchanged):
  - Split entry: `devPlanHours`, `devSpillHours` (raw stored values, possibly `null`) plus `devPlannedHours`, `qaPlanHours`, `qaSpillHours`, `qaPlannedHours` (the resolved `plannedHours()` result, using `devEstimateHours`/`qaEstimateHours` as Original).
  - Non-split entry: `estimateHours` (Original — `computeEffortHours(ticket)`, not currently sent per-entry; needed now since the popup and badge both need to compare against it), `planHours`, `spillHours` (raw stored), `plannedHours` (resolved).
- **`PATCH /api/sprint-plan-entries/:id`** (existing route, currently `{ order?, devOrder?, qaOrder? }`) is extended in place rather than adding a new route — same only-touch-what's-present convention, extended to a per-role **pair** granularity: `{ order?, devOrder?, qaOrder?, dev?: { planHours, spillHours }, qa?: { planHours, spillHours }, single?: { planHours, spillHours } }`. `dev`/`qa`/`single` are only ever sent together as a `{planHours, spillHours}` pair (never one field alone) — this is a deliberate simplification: the frontend always diffs and sends both fields of a role together (mirrors `DevQaOverrideBody`'s "only send what changed," just at pair granularity instead of per-scalar), so the route never needs to reconstruct an "effective plan" from a mix of new-and-already-stored values just to validate. Validation: `spillHours > planHours` for any provided pair → 400; both must be non-negative numbers; `single` is rejected (400) for a Split ticket's entry and `dev`/`qa` are rejected for a non-split entry (look up `entry.ticketId.type` via `isSplitTicket` before applying, same guard shape the existing route already has for other fields).
- **`Ticket.estimateHours`, `computeEffortHours`, `roleSubtaskEstimateHours`, `ticketSync.ts`** — completely unmodified. Plan/Spill is a layer on top of Effort, never a replacement for how Effort itself is derived from Jira.

### Frontend

- **`types.ts`**: `SprintPlanEntry` gains the six raw fields (`devPlanHours`, `devSpillHours`, `qaPlanHours`, `qaSpillHours`, `planHours`, `spillHours`, all `number | null`) plus the three resolved convenience fields (`devPlannedHours`, `qaPlannedHours`, `plannedHours`, all `number`, present alongside their respective raw fields the same way `devEstimateHours`/`qaEstimateHours` are present only for Split entries). Non-split entries also gain `estimateHours: number` (Original, mirrors the Split-only `devEstimateHours`/`qaEstimateHours` convention).
- **`useSprintPlan.ts`**: new `savePlanSpill(entryId: string, role: 'dev' | 'qa' | 'single', pair: { planHours: number; spillHours: number }): Promise<void>` — a thin `PATCH /api/sprint-plan-entries/:id` call (mirrors `reorderEntries`'s existing use of the same route), followed by `refreshPlan()` so capacity cards and every badge update immediately.
- **New shared module — `packages/frontend/src/components/PlanSpillTrio.tsx`**: promotes prototype Variant B's `TrioCardB` component (from `prototype/plan-spill-estimate-ui`'s `planSpillVariants.tsx`) as the one real (non-prototype) widget — split-bar visualization, Plan/Spill inputs, "Planned this sprint" hero readout, spill-exceeds-plan inline validation message. Takes `{ label, original, plan, spill, onPlanChange, onSpillChange, saving, error }`; owns no fetch/save logic itself (mirrors `RoleField`/`DevQaOverrideBody`'s split between presentational sub-component and popup-owned save flow).
- **`DevQaAssignmentPopup.tsx`**: renders `<PlanSpillTrio>` inline under each role's existing select+hint block (Dev's under Dev, QA's under QA), per the grilling session's layout decision. Local state seeded from `devPlanHours ?? devEstimateHours` / `devSpillHours ?? 0` (and the QA equivalent); on submit, diffs each role's `{plan, spill}` pair against its initial value and calls `savePlanSpill` for whichever role(s) actually changed — same "only touch what changed" pattern the existing Dev/QA select diff already uses in this component, just extended to cover the new pair too. Reassigning a role's person does **not** reset that role's Plan/Spill — they're properties of the ticket+role+sprint, not of whichever person currently holds the role.
- **`TicketInfoPopup.tsx`**: renders one `<PlanSpillTrio>` under the Planning assignee select, same diff-on-submit pattern, calling `savePlanSpill(entryId, 'single', ...)`.
- **`TicketBadge`/`roleEstimateHours()` (`PlanningView.tsx`)**: switches from displaying Original to displaying each placement's resolved Planned figure (`devPlannedHours`/`qaPlannedHours` for a Split role placement, `plannedHours` for a non-split entry). Badge gets Variant B's ring treatment — `ring-2 ring-amber-400/70 dark:ring-amber-400/60` when Planned `<` Original (spilled/reduced), `ring-2 ring-emerald-400/70 dark:ring-emerald-400/60` when Planned `>` Original (buffered), no ring when equal — appended to the existing `colorClasses`/`popClasses` composition (careful with the codebase's documented Tailwind-specificity gotcha: `shadow-sm`/`shadow-lg` never coexist in one className string today for exactly this reason — the ring class must be similarly kept to one branch, not layered unconditionally alongside a default).

## Testing Decisions

Match the sprint-leave-picker precedent's testing shape (observable behavior — computed values, HTTP request/response shapes, rendered widget state and callback payloads — never internal state variable names):

- **`packages/backend/test/planSpill.test.ts`** (new): unit tests for `resolvedPlan`/`plannedHours` — no override (both `null`) returns Original unchanged; Plan-only override (Spill `null`) is a pure raise/lower; Spill-only override (Plan `null`) subtracts from Original; both set together; the worked example from the grilling session (Original 16, Plan 16, Spill 16 → Planned 0) as an explicit case; the defensive floor (a Spill somehow exceeding Plan, e.g. stale data, still clamps to 0 rather than going negative, even though the route blocks this at write time).
- **`packages/backend/test/capacity.route.test.ts`** (extend): asserts a Split entry's `devPlanHours`/`devSpillHours` override changes that person's `planned` figure in the response (both the reduced-spill and increased-buffer directions), that an entry with all six fields `null` produces the exact same `planned` as before this feature (regression guard), and that a QA-fully-spilled role contributes `0` to QA's `planned` while Dev's stays untouched — the worked example, end-to-end through the real route.
- **`packages/backend/test/sprintPlanEntries.route.test.ts`** (extend): `PATCH /:id` accepts a `dev`/`qa`/`single` pair and persists both fields together; rejects `spillHours > planHours` (400); rejects `single` against a Split ticket's entry and `dev`/`qa` against a non-split entry (400); `GET /` response includes the new raw + resolved fields with correct defaults (`null` raw fields still produce a resolved figure equal to Original).
- **`packages/frontend/src/components/PlanSpillTrio.test.tsx`** (new): renders Original/Plan/Spill/Planned correctly from props; typing into Plan/Spill calls the right `onChange`; Planned readout updates live from props (parent-controlled, not internal state); a Spill value exceeding the current Plan prop shows the inline error and (per the component contract) the parent is expected to disable/reject submission — test this contract, not a hidden internal disabled-flag.
- **`packages/frontend/src/components/PlanningView.test.tsx`** (extend): opening a Split ticket's popup shows two `PlanSpillTrio`s pre-filled from `devPlanHours ?? devEstimateHours`/etc; saving only a changed role calls `savePlanSpill` for that role alone; the board badge's displayed hours reflect `devPlannedHours`, not `devEstimateHours`, once an override is set; the amber/emerald ring appears/disappears exactly when Planned diverges from Original in the corresponding direction.

## Out of Scope

- Any change to `CapacityLookup`, `computeCapacity`/`capacityFormula.ts` itself, `Ticket.estimateHours`, `computeEffortHours`, or `roleSubtaskEstimateHours` — Plan/Spill is a layer on top of Effort, not a change to how Effort is derived.
- Auto-carry-forward of a spilled ticket's remaining hours into the *next* sprint's plan (e.g. auto-creating or pre-filling a `SprintPlanEntry` there) — explicitly ruled out in the grilling session. Spill only affects the current sprint's Planned figure; moving the actual work item is still a manual "add to plan" in whichever sprint it's picked back up.
- Auto-resetting a stored Plan/Spill override when the underlying Original estimate later changes in Jira (a resync updating a Sub-task's `estimateHours` after a Plan override was explicitly set) — the stored override is a point-in-time planning decision and is left as-is; only an *unset* (`null`) Plan/Spill tracks Original live. Flag to the user if they'd rather have a resync invalidate/reset an explicit override when Original moves.
- Rejected `/prototype` UI variants (A — flat inline row, C — progressive disclosure) — not carried into implementation; their code stays only on the prototype's throwaway branch.
- Any Jira write — this entire feature is a Planning-only annotation, same as Dev/QA Override and Assignee Override; nothing here ever calls a Jira mutation endpoint.

## Further Notes

- This directly follows a `/grill-me` + `/prototype` sequence run earlier in this same conversation: the grilling session locked the data/formula model (scope = both ticket kinds; Plan defaults to Original, freely raised or lowered; Spill defaults to 0, blocked from exceeding Plan; Planned = Plan − Spill; input in plain hours, matching the existing "Extra hrs" field convention) before any UI was built. The UI prototype then built three variants (A/B/C, `?variant=` switcher) at the throwaway route `/prototype/plan-spill`, using fixture data (no backend/DB dependency) reproducing the worked example (3d Dev / 2d QA, QA fully spills). The user picked **Variant B**. The prototype is captured on branch `prototype/plan-spill-estimate-ui` (commit `f013ff1`, not merged, not meant to be built on directly — a primary-source reference for the visual language only; the real implementation should follow this spec's decisions and reuse only `TrioCardB`'s markup as a starting point, since the prototype was written under no-persistence/no-validation-wiring constraints and its Dev/QA/Planning-assignee selects are inert stubs, not the real save flow).
- Suggested skills for whoever picks this up: `tdd` (the pure `planSpill.ts` module and the route contract extension are natural test-first work), `code-review` once implemented.
