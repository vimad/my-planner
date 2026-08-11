# Spec: Sprint Period & Holiday Picker

**Status:** ready-for-agent

## Problem Statement

Today, configuring a Team Sprint Plan's capacity input means typing a raw number into a single "Working days" field (`WorkingDaysForm` in `PlanningView.tsx`) — e.g. "9". That number is disconnected from the sprint's actual calendar: the user has to do the Sat/Sun-and-holiday arithmetic themselves, off-screen, every sprint, and re-derive it by hand if a holiday is added or the sprint's dates shift. Once entered, there's also no way to see or change it afterwards — the form only renders while `planConfigured` is `false`; the moment a value is saved, it's replaced by the capacity strip with no edit affordance, and the sprint's own start/end dates (already cached from Jira on the `Sprint` model) are never shown anywhere in the Planning view.

## Solution

Replace the raw number input with a start-date/end-date range picker. Saturdays and Sundays inside that range are excluded from the working-day count automatically; any other day in the range can be individually marked as a holiday, further excluding it. The resulting working-day count is computed live and shown to the user before they save. Once a period is saved, the same form stays in place — pre-filled with the saved dates and holidays — so the user can come back and edit it (change the range, add/remove a holiday) at any time, not just on first setup. The sprint's period (start–end + working-day count) is visible as soon as a sprint is selected in the Planning view, whether or not it's been configured yet.

This lands the "Variant B" shape validated via `/prototype` earlier in this effort (see Further Notes): two native date inputs plus a flat, always-editable wrap-list of day chips — no calendar grid, no modal.

## User Stories

1. As a user setting up a new sprint's plan, I want to pick the sprint's start date and end date instead of typing a day count, so that the working-day math is derived from the actual calendar instead of something I compute in my head.
2. As a user, I want Saturdays and Sundays inside my picked range to be excluded from the working-day count automatically, so that I don't have to manually subtract weekends every sprint.
3. As a user, I want to see every non-weekend day in my picked range listed individually, so that I can mark specific days as holidays.
4. As a user, I want to click a day to mark it a holiday and click it again to unmark it, so that adjusting for a public holiday or team event is a single, reversible action.
5. As a user, I want the working-day count to update live as I change the date range or toggle holidays, so that I can see the effect of each change before I save anything.
6. As a user, I want weekend days to be visually distinct from weekdays in the day list (dimmed, not clickable), so that I don't mistake them for something I need to act on.
7. As a user, I want a holiday-marked day to look visibly different from a normal working day (e.g. struck through), so that I can tell at a glance which days I've excluded.
8. As a user, when I select a sprint that already has a Jira start/end date but no saved plan yet, I want the date inputs to default to that sprint's own dates, so that the common case (the plan matches the sprint's real calendar) requires zero typing.
9. As a user, I want to save the picked period and have it take effect immediately — the capacity strip below should reflect the new working-day count without a page reload.
10. As a user, once a period has been saved for a sprint, I want to see it displayed (date range + working-day count) every time I come back to that sprint, so that I don't have to reopen an edit form just to check what's configured.
11. As a user, I want to edit an already-saved period — change the start/end dates, add a holiday I forgot, remove one I no longer need — using the exact same form, so that "set" and "edit" aren't two different UIs I have to learn.
12. As a user editing a saved period, I want my previously-marked holidays to still show as marked (not reset to blank) when I reopen the form, so that editing feels like adjusting what's there, not starting over.
13. As a user, if I narrow the date range during an edit such that a previously-marked holiday now falls outside the new range, I want that holiday to be silently dropped rather than causing an error, so that shrinking the range "just works."
14. As a user, I want to be blocked from saving an invalid range (end date before start date, or either date missing), so that I can't accidentally save a plan that would produce a nonsensical working-day count.
15. As a user, I want to still be able to save a period that computes to a low or zero working-day count (e.g. a short sprint that's mostly holidays), so that unusual-but-real sprints aren't blocked by the tool second-guessing me.
16. As a user, I want a failed save (network/server error) to show me an error message and leave my in-progress date/holiday selections exactly as they were, so that I don't lose my picks and have to redo them.
17. As a user with a team that has no roster yet, I want to still be able to set the sprint's period (the capacity strip just stays empty below it), so that plan setup isn't blocked on roster setup happening first.
18. As a user, I want the existing "Tickets by person" table, capacity cards, and every other part of the Planning view to keep working exactly as before, so that this change is additive to the working-days step only.
19. As a developer, I want the working-day derivation (weekend exclusion + holiday exclusion over a date range) to be a pure, unit-testable function independent of Mongoose/route/UI concerns, so that its date-arithmetic edge cases can be verified directly rather than only through an HTTP round-trip.
20. As a developer, I want the existing `computeCapacity` formula and its `GET /:teamId/sprints/:sprintId/capacity` route to remain completely unmodified, so that this feature only changes *where `workingDays` comes from*, not how capacity is computed from it.
21. As a developer, I want date values to be handled as plain calendar-day strings (`YYYY-MM-DD`) throughout — not `Date` objects round-tripped through `toISOString()` — so that the timezone-shift bug found during prototyping (a UTC+ environment silently rendering "Aug 10" as "Aug 9") can't recur.
22. As a user with a team whose sprint plan was configured before this feature shipped (a `workingDays` number with no stored date range), I want the Planning view to show "period not set" for that sprint rather than crashing or showing garbage dates, so that existing real data degrades gracefully until I next edit it.

## Implementation Decisions

- **Winning variant**: "B — Compact form + chips" from the `/prototype` UI comparison run earlier in this effort. Two native `<input type="date">` fields (Start date / End date) — the same convention already used by `MiniCalendar.tsx`'s "Next office day" input — followed by a flat `flex-wrap` list of day chips, one per calendar day in the picked range. Weekend chips render as static, non-interactive, dimmed pills; weekday chips are buttons that toggle a struck-through "holiday" visual state on click. A live `"X/Y working days"` badge sits at the top of the form. The form has no separate create/edit mode — it always renders with whatever period is currently known (saved period if one exists, else the selected `Sprint`'s own Jira `startDate`/`endDate` as a default, else blank) and a single "Save period" action. This replaces the `WorkingDaysForm` component and its `!planConfigured` gating in `PlanningView.tsx` entirely; the rejected calendar-grid and modal-wizard variants are not carried into scope (they remain only on the prototype's throwaway branch — see Further Notes).

- **Where the form renders**: unconditionally, as soon as a sprint is selected — not gated behind `!planConfigured` anymore. The existing capacity-cards strip renders below it only once a plan exists (`planConfigured === true`), same condition as today, just no longer mutually exclusive with the form itself.

- **Schema — `TeamSprintPlanDoc`** (`packages/backend/src/models/TeamSprintPlan.ts`) gains three fields and keeps `workingDays`:
  ```ts
  export interface TeamSprintPlanDoc {
    teamId: Types.ObjectId
    sprintId: Types.ObjectId
    startDate?: string   // 'YYYY-MM-DD', calendar-day string — see the timezone decision below
    endDate?: string     // 'YYYY-MM-DD'
    holidays: string[]   // 'YYYY-MM-DD' entries, subset of weekdays within [startDate, endDate]; default []
    workingDays: number  // now SERVER-DERIVED from startDate/endDate/holidays, never client-supplied
    createdAt: Date
    updatedAt: Date
  }
  ```
  `startDate`/`endDate` are optional at the schema level (not `required: true`) specifically so that a team's real, already-existing `TeamSprintPlan` documents — created before this feature shipped, holding only a manually-entered `workingDays` — continue to read back validly instead of failing schema validation. New writes always populate all three fields (enforced at the route layer, not the schema layer, mirroring how `TeamSprintPlanBody`/handler validation already works today).

- **Date representation — calendar-day strings, not `Date`**: `startDate`, `endDate`, and every `holidays` entry are stored and transmitted as plain `'YYYY-MM-DD'` strings, matching the convention `dateAgenda.ts`'s `localTodayISO()`/`DateRange` already use on the frontend for due dates. This is a deliberate divergence from `Sprint.startDate`/`Sprint.endDate` (which stay `Date`, unchanged — they're a raw Jira cache, out of scope here). The prototype (`SprintPeriodPrototype.tsx`) originally built its range-iteration helper on `new Date(...).toISOString().slice(0, 10)`, which converts through UTC and silently shifted every date back by one day in this environment's UTC+5:30 timezone ("Aug 10" rendered as "Aug 9", the sprint's real end date vanished from the list). The fix — formatting from the `Date` object's local fields (`getFullYear()`/`getMonth()`/`getDate()`) instead of `toISOString()` — is the pattern to carry into the real implementation; the safest way to guarantee it is to avoid `Date` entirely for anything that becomes a stored/compared calendar day, and only ever use `Date` objects transiently inside the iteration loop, discarding them back to a string immediately.

- **New pure function — `computeWorkingDays`**: lives in `packages/backend/src/services/`, sibling to `capacityFormula.ts` and following the same "pure math, no Mongoose/route concerns, directly unit-testable" pattern.
  ```ts
  export function computeWorkingDays(startDate: string, endDate: string, holidays: string[]): number
  ```
  Inclusive of both `startDate` and `endDate`. Excludes Saturday/Sunday. Excludes any date present in `holidays`, whether or not it's also a weekend (a holiday entry that happens to be a weekend day is simply a no-op, not an error). Returns `0` for an invalid or empty range (`endDate < startDate`) rather than throwing — the route layer is responsible for rejecting an invalid range before it ever reaches this function, so `0` here is a defensive default, not a user-facing signal.

- **Route contract — `packages/backend/src/routes/teamSprintPlans.ts`**:
  - `POST /api/team-sprint-plans` body becomes `{ teamId, sprintId, startDate, endDate, holidays? }` (`holidays` optional, defaults to `[]`). `workingDays` is **no longer accepted from the client** — the handler computes it via `computeWorkingDays` and stores the result alongside the three input fields. Validation: `teamId`, `sprintId`, `startDate`, `endDate` all required (400 if missing, same style as today's `workingDays` check); `endDate >= startDate` required (400 otherwise); the unique `(teamId, sprintId)` index and its 409-on-duplicate behavior are unchanged.
  - `PATCH /api/team-sprint-plans/:id` body becomes `{ startDate, endDate, holidays? }`, same validation as `POST`, same recompute-and-overwrite of `workingDays`. This is the edit path the always-visible form's "Save period" button uses once a plan already exists for the selected sprint.
  - `GET /api/team-sprint-plans?teamId=&sprintId=` response shape is unchanged in structure (still the whole doc, now including `startDate`/`endDate`/`holidays`) — this route already exists but the frontend currently never calls it directly (see hook change below); it starts being called for real.
  - `GET /:teamId/sprints/:sprintId/capacity` (`routes/capacity.ts`) and `computeCapacity`/`capacityFormula.ts` are **unmodified** — they keep reading `teamSprintPlan.workingDays` exactly as today, unaware of where that number came from.

- **Frontend hook — `useSprintPlan.ts`**: add a fourth parallel fetch (alongside the existing sprints / memberships / capacity+entries fetches, same "independent fetch, own loading lifecycle" pattern the hook's own top comment already documents) for `GET /api/team-sprint-plans?teamId=&sprintId=`, tolerating its own 404 as "no plan yet."
  - New return field `sprintPeriod: { startDate: string; endDate: string; holidays: string[]; workingDays: number } | null` (`null` before any plan exists, or when an existing legacy plan has no stored `startDate`/`endDate` — see the migration story below).
  - `setWorkingDays(workingDays: number)` is replaced by `setSprintPeriod(period: { startDate: string; endDate: string; holidays: string[] })`, renamed from `savingWorkingDays` to `savingSprintPeriod`. Internally it branches on whether a plan already exists for this team+sprint (POST if not, PATCH the existing plan's id if so) — this branching stays inside the hook, not pushed onto the UI component, mirroring how the hook already owns similar create-vs-update decisions elsewhere. On success it refreshes both the plan fetch and `refreshPlan()` (capacity+entries), since a changed `workingDays` changes every capacity card.
  - `planConfigured` keeps its existing meaning and existing source (the capacity endpoint's own 404) — unchanged, since `capacity.ts` is unmodified. `sprintPeriod` is a separate, additive piece of state, not a replacement for `planConfigured`.

- **Frontend component — `PlanningView.tsx`**: `WorkingDaysForm` is deleted. A new form component (in-file, matching the file's existing convention of small focused components like `AddToPlanForm`/`SyncPlanButton` living alongside `PlanningView`) replaces it, wired to `sprintPeriod`/`savingSprintPeriod`/`setSprintPeriod` and the selected `Sprint`'s own `startDate`/`endDate` (for the no-plan-yet default). Rendered unconditionally once a sprint is selected, per the "where the form renders" decision above; the capacity-cards strip keeps its existing `planConfigured` gate below it.

- **Holiday selection intersected with range changes**: when the user changes either date input, any currently-checked holiday that falls outside the new `[startDate, endDate]` range is dropped from local state automatically (not surfaced as an error) — same behavior validated in the prototype.

- **Migration — pre-existing real `TeamSprintPlan` docs**: this repo's live data already has at least one configured plan (a real team's active sprint, `workingDays` set, no `startDate`/`endDate`/`holidays`). No backfill script. `sprintPeriod` for such a plan reads back with `startDate`/`endDate` absent; the Planning view shows a "period not set" state (form defaults to the sprint's own Jira dates, same as a genuinely-unconfigured sprint) even though a `workingDays` number and working capacity cards already exist. The first save through the new form is what gives that plan a real stored period going forward, silently overwriting whatever `workingDays` value was there before with the freshly-derived one.

- **`CONTEXT.md` update required**: the existing "Team Sprint Plan" glossary entry ("A Team's per-Sprint header settings — currently just the sprint's shared working-day count (holiday-adjusted, entered manually, same for every person on the team)") describes the old manual-entry behavior and must be updated as part of this work to describe the date-range/holiday-list-derived version, per this repo's single-context domain-doc convention (`docs/agents/domain.md`).

## Testing Decisions

- Good tests here assert observable behavior — computed working-day counts for given inputs, HTTP request/response shapes, rendered chip states and callback payloads — not internal implementation details like which React state variable holds what.

- **`packages/backend/test/sprintWorkingDays.test.ts`** (new file, same bare-function-import style as `capacityFormula.test.ts`): direct unit tests of `computeWorkingDays`, covering — a plain Mon-Fri range with no holidays; a range spanning at least one full weekend (confirms Sat/Sun exclusion); a holiday on a weekday inside the range (excluded); a holiday entry that falls on a weekend or outside the range (no-op, doesn't double-subtract or error); a single-day range; an inverted/invalid range (`endDate < startDate`) returning `0`; a range where every weekday is also marked a holiday (returns `0`, not negative).

- **`packages/backend/test/teamSprintPlans.route.test.ts`** (extend the existing file, same `vi.mock`-the-model + `createApp()` + `supertest` pattern already established there): the existing `workingDays`-in-body tests are **rewritten**, not merely extended, since the contract itself changes —
  - `POST /api/team-sprint-plans` with `{ teamId, sprintId, startDate, endDate, holidays }` creates a plan with a server-computed `workingDays` (assert `TeamSprintPlan.create` is called with the computed value, not a client-supplied one).
  - `POST` rejects a missing `startDate`/`endDate` (400) — replaces the old "missing/non-numeric workingDays" case.
  - `POST` rejects `endDate < startDate` (400).
  - Duplicate-pair 409 behavior: unchanged, still covered.
  - `PATCH /api/team-sprint-plans/:id` with new `startDate`/`endDate`/`holidays` recomputes and persists `workingDays`.
  - `PATCH` rejects an invalid range the same way `POST` does.
  - `GET` 404-when-not-configured and 400-when-missing-query-params cases: unchanged, still covered as-is.

- **`packages/frontend/src/components/PlanningView.test.tsx`** (extend the existing file, same fetch-mock + RTL pattern already used there — this flow currently has **zero** existing coverage in this file, so these are new `describe` blocks, not edits to existing ones):
  - Selecting a sprint with no saved plan renders the period form pre-filled from that `Sprint`'s own `startDate`/`endDate` (or blank if the sprint itself has none).
  - The rendered day-chip list matches the picked range exactly (correct count, correct weekend/weekday split) — this is the regression guard for the `toISOString()` timezone bug; assert against dates that would actually expose an off-by-one in a UTC+ environment if the fix regressed (e.g. a range starting on the 1st of a month).
  - Clicking a weekday chip toggles its holiday visual state and updates the displayed `X/Y working days` count.
  - Clicking "Save period" calls the mocked `POST`/`PATCH` (whichever applies) with the exact `{ startDate, endDate, holidays }` body, and the capacity strip re-fetches/re-renders afterward.
  - Selecting a sprint that already has a saved plan pre-fills the form with its stored `startDate`/`endDate`/`holidays` (not the `Sprint`'s own Jira dates) and shows the capacity cards below it.
  - Narrowing the date range after a holiday is checked drops that holiday from the selection and the displayed count, without an error.
  - An invalid range (end before start) disables/blocks Save and shows no working-day count.
  - A failed save (mocked non-ok response) surfaces an error and leaves the form's in-progress selections unchanged.
  - A sprint whose plan doc has `workingDays` but no `startDate`/`endDate` (the migration case) renders the "period not set" default state rather than crashing.

## Out of Scope

- The rejected `/prototype` variants (inline month-calendar grid; modal-wizard-triggered-from-a-badge) — neither is carried into implementation; their code stays only on the prototype's throwaway branch.
- Automatic recognition of public holidays or import of an external holiday calendar — holidays remain entirely manual, per-sprint, per-team.
- Reusing or sharing a holiday set across sprints or across teams (e.g. "this company's holidays are the same every sprint") — every `TeamSprintPlan`'s `holidays` list is entered fresh; no template/copy-forward mechanism.
- Any change to `CapacityEntry` (per-person leave days), `CapacityLookup`, or the `computeCapacity` formula itself.
- Any change to the `Sprint` model's own Jira-sourced `startDate`/`endDate` fields — they stay a read-only cache, used here only as a default seed.
- A backfill/migration script for pre-existing `TeamSprintPlan` documents that only have `workingDays` — they display "period not set" until next manually edited (see Implementation Decisions).
- Any change to `SprintSelect.tsx`'s own dropdown rendering (e.g. showing dates in the closed dropdown list itself) — the period display lives in the always-visible form below the selector, not inside the selector's trigger/listbox.

## Further Notes

- This directly follows a `/prototype` UI session run earlier in this same effort: three variants (A — inline calendar, B — compact form + chips, C — modal wizard) were built behind a `?variant=` switcher mounted on the real `/sprint/:teamSlug/planning` route, verified live against a `Test` team (created for this purpose, safe to mutate) with a real Jira-backed sprint. The user picked **B**. The prototype file (`packages/frontend/src/components/SprintPeriodPrototype.tsx`) and the `PlanningView.tsx` wiring that mounted it are still sitting uncommitted on `main` as of this spec — per the `prototype` skill's own capture step, these need to move to a throwaway branch (not be folded into the real implementation as-is; rewrite properly per this spec's decisions) before or as part of picking up this ticket. The real, encountered bug this spec's timezone decision is built around — `toISOString()`-based date iteration shifting every date back a day in a UTC+5:30 environment — was found and fixed live during that prototype's manual verification.
- Environment: MongoDB runs via `docker compose` (`my-planner-mongo`); `pnpm db:up` / `pnpm dev` as usual. No new dependencies — native `<input type="date">`, no date-picker library.
- Suggested skills for whoever picks this up: `tdd` (the pure `computeWorkingDays` function and the route contract rewrite are natural test-first work), `code-review` once implemented.
