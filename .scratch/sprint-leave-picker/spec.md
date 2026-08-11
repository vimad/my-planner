# Spec: Sprint Leave Picker

**Status:** ready-for-agent

## Problem Statement

Today, `CapacityEntry.leaveDays` is a single manually-typed number per (Team Membership, Sprint) — e.g. "1.5". There's no UI to edit it at all yet (`packages/backend/src/routes/capacityEntries.ts` exists but nothing in the frontend calls it); the Planning view's `CapacityCard` only ever *displays* `leaveDays` read-only. Entering a leave day means doing the calendar arithmetic in your head ("she's out the 12th and half the 19th, that's 1.5") off-screen, with no record of *which* days, so a Team Sprint Plan's date range or holiday list can change later with no way to tell whether previously-entered leave is still valid.

## Solution

Replace the scalar `leaveDays` with a set of per-date leave entries — one `{ date, portion }` per day someone's out, `portion` either `'full'` (8h) or `'half'` (4h) — picked directly against the sprint's actual working-day calendar (the same date range + holiday exclusions the Team Sprint Plan's period picker already computes). The Planning view gets a new whole-team grid: people as rows, the sprint's working dates as columns, each cell a click-to-cycle (none → half → full → none) toggle. A person's total leave, and therefore their Available/Remaining capacity, updates live as cells are toggled.

This lands **Variant C ("whole-team grid")**, the winning variant from a `/prototype` UI session run earlier in this effort (see Further Notes) — chosen over a per-person inline-card-expansion variant and a per-person modal variant, because bulk-editing everyone's leave for a sprint in one place beat drilling into one person at a time.

## Domain model changes

- **`CapacityEntry`** (`packages/backend/src/models/CapacityEntry.ts`): `leaveDays: number` is replaced by `leaveEntries: { date: string; portion: 'full' | 'half' }[]`, default `[]`. `date` is a plain `'YYYY-MM-DD'` calendar-day string (never `Date`/`toISOString()` — same timezone rule as `TeamSprintPlan.startDate`/`holidays`, see `sprint-period-picker/spec.md`'s timezone decision). No migration needed — **the real database currently has zero `CapacityEntry` documents** (verified directly against the running `my-planner-mongo` instance before writing this spec), so this is a clean breaking schema change, not an additive one.
- **`CONTEXT.md`**'s "Capacity Entry" glossary entry ("A Team Membership's leave for one Sprint (in days, down to half-day granularity)...") gets a one-line addition noting it's now a set of dated entries, not a bare number — update as part of this work, per this repo's single-context domain-doc convention (`docs/agents/domain.md`).

## Implementation Decisions

### Backend

- **New pure module — `packages/backend/src/services/leaveEntries.ts`**, sibling to `capacityFormula.ts`/`sprintWorkingDays.ts` (pure, no Mongoose/route concerns, directly unit-testable). Promotes the already-prototyped functions from the throwaway branch (`prototype/sprint-leave-picker`, see Further Notes) verbatim:
  ```ts
  export type LeavePortion = 'full' | 'half'
  export interface LeaveEntry { date: string; portion: LeavePortion }
  export function setLeave(entries: LeaveEntry[], date: string, portion: LeavePortion): LeaveEntry[]
  export function clearLeave(entries: LeaveEntry[], date: string): LeaveEntry[]
  export function totalLeaveDays(entries: LeaveEntry[]): number   // full=1, half=0.5
  export function reconcileWithWorkingDates(entries: LeaveEntry[], workingDates: string[]): LeaveEntry[]
  ```
- **`sprintWorkingDays.ts` gains a sibling function returning the actual date list, not just the count** — `capacity.ts` needs the real working dates to reconcile stored `leaveEntries` against, and the frontend grid needs them to render columns:
  ```ts
  export function computeWorkingDates(startDate: string, endDate: string, holidays: string[]): string[]
  ```
  Same inclusion/exclusion rules as the existing `computeWorkingDays` (inclusive range, excludes weekends and `holidays`); `computeWorkingDays` can become a one-line wrapper (`computeWorkingDates(...).length`) once this exists, or the two can stay independent — implementer's call, but they must never disagree (add a test asserting `computeWorkingDates(...).length === computeWorkingDays(...)` for a few cases if kept independent).
- **Reconciliation is read-time, not a cross-collection write cascade.** When a `TeamSprintPlan`'s period changes (a holiday added, the range narrowed), we do **not** sweep every `CapacityEntry` for that team+sprint and mutate them. Instead, `GET /:teamId/sprints/:sprintId/capacity` (`routes/capacity.ts`) always reconciles a membership's stored `leaveEntries` against the *current* working-date list before using them: `const reconciled = reconcileWithWorkingDates(capacityEntry?.leaveEntries ?? [], workingDates)`, then `leaveDays = totalLeaveDays(reconciled)`. This keeps every capacity figure correct immediately after any period edit with zero extra writes. A stored entry for a date that's since become a holiday simply stops counting and stops rendering (the grid only ever shows current working-date columns) — if the holiday is later removed, the entry counts again. This is a deliberate, documented choice (data isn't lost, just temporarily inert) — flag it to the user if they'd rather have period edits hard-delete now-invalid entries.
- **`computeCapacity`/`capacityFormula.ts` stays completely unmodified** — same as the sprint-period-picker precedent, it keeps taking a plain `leaveDays: number`; only *where that number comes from* changes.
- **`GET /:teamId/sprints/:sprintId/capacity` response** gains two fields per person, alongside the existing (now-derived, not stored-scalar) `leaveDays`:
  - `capacityEntryId: string | null` — the underlying `CapacityEntry`'s `_id`, or `null` if none exists yet for this membership+sprint. Lets the frontend know whether its next save is a POST or a PATCH, mirroring `TeamSprintPlan`'s existing POST-vs-PATCH branching in `useSprintPlan.ts`.
  - `leaveEntries: LeaveEntry[]` — the *reconciled* entries (see above), so the frontend never has to re-filter or handle a stale date itself.
- **`routes/capacityEntries.ts`** rewritten around the new shape:
  - `POST /api/capacity-entries` body becomes `{ teamMembershipId, sprintId, leaveEntries? }` (`leaveEntries` optional, defaults to `[]`). Same required-field and duplicate-409 behavior as today.
  - `PATCH /api/capacity-entries/:id` body becomes `{ leaveEntries: LeaveEntry[] }` (full-array replacement — the grid always holds and sends a person's complete leave set for the sprint, not a single-cell diff). Validates every entry's `date` falls within the sprint's *current* working dates (400 with a clear message otherwise) — look up the `CapacityEntry`'s `teamMembershipId` → `TeamMembership.teamId`, then that team's `TeamSprintPlan` for the entry's `sprintId`, to get `startDate`/`endDate`/`holidays` and run `computeWorkingDates`. Also validates `portion` is `'full'` or `'half'`.
  - `GET /api/capacity-entries?teamMembershipId=&sprintId=` — unchanged shape (whole doc, now with `leaveEntries` instead of `leaveDays`), still 404s when absent. (Kept for parity/debugging; the Planning view itself uses the bulk capacity endpoint above, not this one, to avoid firing one request per person.)

### Frontend

- **`types.ts`**: `SprintCapacity` gains `capacityEntryId: string | null` and `leaveEntries: { date: string; portion: 'full' | 'half' }[]`; `leaveDays: number` stays (still what `CapacityCard`'s existing "Xd leave" line reads — no change needed there).
- **`useSprintPlan.ts`**: new `setLeaveEntries(teamMembershipId: string, entries: LeaveEntry[]): Promise<void>`. Branches POST-vs-PATCH internally using that person's `capacityEntryId` from the current `capacity` array (mirrors `setSprintPeriod`'s existing branch-inside-the-hook convention). On success, refreshes `refreshPlan()` (capacity+entries) so every capacity card's numbers and the grid itself reflect the save immediately.
- **New component — `SprintLeaveGrid.tsx`** (real, not gated behind `?variant=` or dev-only): promotes prototype Variant C. Rows = every current `TeamMembership` (same set `PlanningView.tsx` already iterates for `CapacityCard`), columns = `computeWorkingDates(sprintPeriod.startDate, sprintPeriod.endDate, sprintPeriod.holidays)` — extract this date-list derivation into a small shared frontend helper (it's currently duplicated as `enumerateRangeDays` + a weekend/holiday filter inline in `SprintPeriodForm`; both call sites should share one implementation rather than a third inline copy). Each cell click calls `setLeaveEntries` with that person's full entries array with the clicked date's portion cycled (none → half → full → none, matching the prototype). A `Total` column shows each person's live `totalLeaveDays`.
- **Mount point in `PlanningView.tsx`**: directly below the existing `CapacityCard` strip, same `planConfigured` gate (only renders once a plan/roster exists) — always visible, no extra collapse toggle for v1 (the period form only grew one as a *follow-up* after it shipped; don't pre-build one speculatively here).
- **Styling**: copy the prototype Variant C's table markup/classes as a starting point (`docs/ui-conventions.md` Archetype D card wrapper, `#1a1229`-family sticky header cell already used elsewhere for a dark anchored surface) — it was already built against this repo's real conventions, not a from-scratch mockup.

## Testing Decisions

Match the sprint-period-picker precedent's testing shape (observable behavior — computed values, HTTP request/response shapes, rendered cell states and callback payloads — not internal state variable names):

- **`packages/backend/test/leaveEntries.test.ts`** (new): unit tests for `setLeave`/`clearLeave`/`totalLeaveDays`/`reconcileWithWorkingDates` — half+full mixed totals, setting an already-set date replaces rather than duplicates, clearing an absent date is a no-op, reconciling drops only out-of-range dates and leaves the rest untouched, reconciling against an empty working-date list drops everything.
- **`packages/backend/test/sprintWorkingDays.test.ts`** (extend): tests for `computeWorkingDates` mirroring the existing `computeWorkingDays` cases (plain range, weekend exclusion, holiday exclusion, invalid range → `[]`), plus the cross-check that both functions agree on the same inputs.
- **`packages/backend/test/capacityEntries.route.test.ts`** (rewrite the body-shape parts): POST/PATCH now send/validate `leaveEntries`, not `leaveDays`; PATCH rejects an entry whose date falls outside the sprint's current working dates (400) — requires mocking the `TeamMembership`→`TeamSprintPlan` lookup chain, same `vi.mock`-the-model pattern already used in this file.
- **`packages/backend/test/capacity.route.test.ts`** (extend): asserts the response's `leaveDays` reflects *reconciled* entries (an out-of-range stored entry doesn't count), and that `capacityEntryId`/`leaveEntries` are present and correctly `null`/`[]` when no `CapacityEntry` exists yet for a membership.
- **`packages/frontend/src/components/PlanningView.test.tsx`** (new `describe` block, zero existing coverage for this flow): grid renders one column per working date and one row per membership; clicking a cell cycles none→half→full→none and calls the mocked POST/PATCH with the full updated entries array; a capacity card's Available/Remaining figure updates after a save; grid columns match `sprintPeriod`'s working dates exactly (not the raw calendar range) — regression guard mirroring the sprint-period-picker's own timezone-bug guard test.

## Out of Scope

- Any change to `CapacityLookup` or `computeCapacity`/`capacityFormula.ts` itself.
- A cross-collection write cascade that prunes `CapacityEntry.leaveEntries` when a `TeamSprintPlan` period is saved — deliberately read-time reconciliation only (see Implementation Decisions).
- Collapsing the grid behind a toggle, or any other density/layout follow-up — ship the always-visible grid first, per the sprint-period-picker precedent of adding a collapse toggle only as a later, separately-scoped ticket once the always-visible version proved too heavy.
- Rejected `/prototype` UI variants (A — inline per-person card expansion, B — per-person modal) — not carried into implementation; their code stays only on the prototype's throwaway branch.
- Bulk/templated leave (e.g. "same holidays as last sprint," recurring leave) — every sprint's `leaveEntries` are entered fresh per person, no copy-forward.

## Further Notes

- This directly follows a `/prototype` session (logic + UI) run earlier in this same conversation: a logic prototype (`services/sprintLeavePrototype.ts` + a TUI script) validated the `{date, portion}` shape and the reconcile-on-working-date-change behavior; a UI prototype (`PlanningViewLeavePrototype.tsx`) built three variants (A/B/C, `?variant=` switcher) mounted on the real `/sprint/:teamSlug/planning` route against the `Test` team (roster of two manually-added people, real sprint period), verified live in the browser. The user picked **Variant C**. Both prototypes are captured on branch `prototype/sprint-leave-picker` (not merged, not meant to be built on directly — a primary-source reference only; the real implementation should follow this spec's decisions, not copy the prototype's code wholesale, since the prototype was written under no-persistence/no-error-handling constraints).
- Suggested skills for whoever picks this up: `tdd` (the pure `leaveEntries.ts`/`computeWorkingDates` functions and the route contract rewrites are natural test-first work), `code-review` once implemented.
