# Interactive calendar date/range filter

Status: ready-for-agent

Source: synthesized directly from a `/to-spec` conversation (seam and two UX decisions confirmed with the user; no wayfinder map needed).

## Problem Statement

The `MiniCalendar` widget next to the agenda is currently a static picture: it always shows the current calendar month, marks days that have a todo due, and highlights "today" and the "next office day" — but the day cells aren't clickable, and there's no way to move to a different month. The user wants to actually use this calendar the way a calendar filter normally works elsewhere: click a day (or drag across a few days) to narrow the todo list down to just what's due then, and flip between months to check dates outside the current one.

## Solution

`MiniCalendar` becomes interactive in two independent ways:

1. **Month navigation** — prev/next controls let the user browse any month, not just the current one. "Today" and due-date markers still compute live off the real current date regardless of which month is being viewed.
2. **Date/range selection as a todo filter** — clicking a day filters the agenda down to todos due that day. Clicking a second, later day extends the first into a range filter (inclusive of both ends). Selecting a range previews live: after the first click, hovering over later days highlights the would-be range, but no filtering happens until the second click commits it. An explicit clear affordance removes the filter and returns to the unfiltered agenda; clicking any day again after a range is already committed starts a brand-new selection rather than extending or clearing the old one.

This composes with the existing filters rather than replacing them: search text, category chips, and the new date/range selection all narrow the same underlying todo list together, exactly like search and category chips already do today. The agenda below keeps its existing Overdue/Today/Tomorrow/This week/Later/No date grouping — a date filter just narrows what lands in those buckets (see Implementation Decisions for the "No date" edge case).

This is a client-side-only change. The full todo list for the active profile is already fetched in one shot with no pagination, so there's no need for a new backend endpoint — the calendar's selection becomes a third client-side filtering stage alongside the two that already exist.

## User Stories

1. As a user, I want to click a day on the calendar, so that the agenda narrows to only todos due that day.
2. As a user, I want to click a second, later day after clicking a first, so that the agenda narrows to todos due anywhere within that inclusive range.
3. As a user, I want to see the in-progress range highlighted as I move my pointer after the first click, so that I can see what I'm about to select before committing to it.
4. As a user, I want the filter to only actually apply once I've clicked the second day, so that hovering around doesn't cause the list to flicker/refilter on every mouse movement.
5. As a user, I want to click the same day twice to just filter to that single day, so that a range isn't forced on me for a one-day filter.
6. As a user, I want an obvious way to clear the date/range filter, so that I can get back to seeing everything without reloading the page.
7. As a user, I want prev/next controls on the calendar, so that I can look at (and filter by) a month other than the current one.
8. As a user, I want "today" and the due-date dots to still be computed off the real current date, so that navigating to a different month doesn't make the calendar think a different day is "today".
9. As a user, I want the calendar's month view to stay on whatever month I navigated to after I pick a date/range from it, so that the view doesn't jump back to the current month underneath me.
10. As a user, I want the date/range filter to combine with my search text and category chip selections, so that I can narrow by all three at once (e.g. "Work" category + "urgent" search + this week's range).
11. As a user, I want the agenda's existing Overdue/Today/Tomorrow/This week/Later grouping to still show while a date filter is active, so that the view stays visually consistent with how I already read the agenda.
12. As a user, I want the "No date" bucket to disappear whenever a date/range filter is active, so that I'm not shown a bucket of todos that can never match the date I picked.
13. As a user, I want the "office-linked" todos (linked to the next office day instead of a raw due date) to be filtered the same way any other due-date todo would be, so that the date filter behaves consistently regardless of how a todo's due date was set.
14. As a user, I want the "Next office day" input/control at the bottom of the calendar to keep working exactly as it does today, so that adding month navigation and day selection doesn't regress that existing feature.
15. As a user, I want the calendar's selected day/range to stay visible on the calendar (e.g. highlighted cells) while the filter is active, so that I can see at a glance what I'm currently filtered to without checking a separate label.
16. As a user, I want clicking any day after a range is already committed to start a brand-new selection rather than extending the old one, so that picking a new filter is always the same unambiguous two-click gesture, with no separate "cancel mid-selection" step to learn.
17. As a user, I want the day cells to be real, keyboard/screen-reader-accessible controls (not inert divs), so that the calendar is consistent with the rest of the app's accessibility bar.
18. As a developer, I want the date-range-match logic to live as a small pure function alongside the existing `dateAgenda.ts` helpers, so that it's unit-testable independent of any component rendering.
19. As a user, I want switching the active profile to clear or otherwise sanely reset the date filter, so that a filter set up in one profile doesn't silently and confusingly carry over and hide todos in another.

## Implementation Decisions

**Scope of change**: frontend-only. No backend route, schema, or query-param changes — `GET /api/todos` keeps returning the full unfiltered list per profile, exactly as today.

**`MiniCalendar` becomes stateful**:
- Add a `viewDate` state (the month currently displayed), defaulting to the current month on mount — same `useState(() => ...)` + `changeMonth(delta)` pattern already implemented in `DatePickerPopup` (`packages/frontend/src/components/dateBadge/DatePickerPopup.tsx`). Add "Previous month" / "Next month" buttons around the month/year heading, mirroring that component's markup and `aria-label`s.
- "Today" (the violet/fuchsia highlight) and the cyan due-date dots keep computing off `localTodayISO(new Date())` regardless of `viewDate` — navigating months must never change what "today" means.
- Day cells change from plain `<div>`s to `<button type="button">`s so they're keyboard- and screen-reader-accessible, matching `DatePickerPopup`'s cell markup.

**Selection state and interaction model** (lifted up, not owned by `MiniCalendar` — same pattern already used for `nextOfficeDay`/`onSetOfficeDay`):
- New props: something like `selectedRange: { start: string; end: string } | null` and `onSelectRange: (range: { start: string; end: string } | null) => void`, plus internal-only in-progress state for the hover preview (this part can stay local to `MiniCalendar` since nothing outside the component needs to know about an uncommitted selection).
- Click sequence:
  1. First click on a day with no in-progress selection: sets that day as a provisional `start` with no committed filter yet (`onSelectRange` is *not* called).
  2. While a provisional `start` exists and no `end` is committed, hovering other day cells visually previews the inclusive range between `start` and the hovered day (highlight styling on the cells in between) without calling `onSelectRange`.
  3. Second click on a day (any day, before or after `start`) commits the range: normalize so `start <= end` regardless of click order, call `onSelectRange({ start, end })`. There is no separate "replace the provisional start" gesture — every click while a `start` is pending commits, per the confirmed click-start/hover-preview/click-end-to-commit model.
  4. Clicking the same day twice in a row (start click, then a second click on that identical day) commits a single-day range (`start === end`).
  5. Once a range is committed, clicking any day cell again starts a brand-new selection (goes back to step 1) — it does not extend the existing committed range.
- Clearing: an explicit "×"-style clear affordance near the calendar (visible whenever `selectedRange` is non-null), consistent with the existing clear button already present for `nextOfficeDay`. Clicking it calls `onSelectRange(null)`.
- Visual language: reuse the existing violet/fuchsia gradient token for "today" but pick a visually distinct treatment for "selected"/"in preview range" (e.g. a solid or lighter violet fill/ring across the cells in the range) so today, office-day, due-date dot, and selection remain simultaneously legible on the same cell when they overlap.

**Date-range matching helper**: add a small pure function alongside the existing ones in `packages/frontend/src/utils/dateAgenda.ts` (e.g. `matchesDateRange(dueDate: string | null, range: { start: string; end: string } | null): boolean`) that does inclusive ISO-string comparison. Since `dueDate` strings are already zero-padded `YYYY-MM-DD`, plain string comparison is sufficient (no `Date` parsing needed), consistent with how the rest of `dateAgenda.ts` treats these strings as opaque, lexically-ordered local-day identifiers.

**Which date the filter matches against**: the filter should match a todo's *effective* due date — i.e. reuse `effectiveDueDate(todo, nextOfficeDay)` (already exported from `dateAgenda.ts`), not the raw `dueDate` field — so that office-linked todos participate in the filter the same as any todo with an explicit due date (user story 13).

**Filter chain wiring in `App.tsx`**: add a new piece of state, e.g. `selectedDateRange: { start: string; end: string } | null`, following the exact convention already used for `selectedCategoryIds`. Extend the existing `visibleTodos` derivation to add a third stage:

```
searchedTodos  → (search query, existing)
  → categoryFiltered  → (category chips, existing)
    → visibleTodos  → (date range via matchesDateRange(effectiveDueDate(...), selectedDateRange), new)
```

`MiniCalendar` itself keeps receiving the *unfiltered* `todos` list (per the existing, intentional comment in `App.tsx` about calendar dots/category counts not being affected by search) — the new date filter narrows `visibleTodos` passed to `AgendaGroups`/`CompletedTodos`, it does not narrow what `MiniCalendar` uses to compute its due-date dots.

**Interaction with the existing Overdue/Today/Tomorrow/This week/Later/No date grouping**: `AgendaGroups` itself is unchanged — it keeps grouping whatever list it's handed. When `selectedDateRange` is non-null, the "No date" group naturally becomes empty (since `matchesDateRange` requires a non-null effective due date to match) and `AgendaGroups`' existing empty-group filtering already drops it from view — no new logic needed there beyond the upstream filter.

**Profile switch behavior**: reset `selectedDateRange` to `null` whenever the active profile changes (same lifecycle point where other profile-scoped UI state is already reset/refetched), so a filter never silently persists across a profile switch.

**Out-of-scope-adjacent clarification**: month navigation and selection are independent features that both land on `MiniCalendar` in this same change, but neither depends on the other being used — a user can navigate months without ever selecting a date, and (per user story 9) picking a date/range must not force the view back to the current month.

## Testing Decisions

- Only test externally observable behavior: rendered calendar markup/highlight state and callback invocations for `MiniCalendar`, and computed list membership for the pure helper — not internal state shape.
- **`packages/frontend/src/utils/dateAgenda.test.ts`** (existing file, extend it): unit tests for the new `matchesDateRange` helper — null range means "everything matches", single-day range, multi-day range, boundary-inclusive start/end, a due date outside the range, and a null effective due date never matching a non-null range.
- **`packages/frontend/src/components/MiniCalendar.test.tsx`** (existing file, extend it): using the existing `vi.useFakeTimers()` + `vi.setSystemTime(...)` convention already in this file —
  - month navigation: clicking "Next month"/"Previous month" changes the rendered heading and day grid, while the "today" highlight and due-date dots still land on the real current date only when that month is in view.
  - single-day selection: clicking a day cell calls `onSelectRange` with `{ start, end }` equal to that day.
  - range selection: clicking a start day, then a later day, calls `onSelectRange` with the normalized `{ start, end }`; clicking an earlier day second still normalizes `start <= end`.
  - in-progress preview: after a first click and before a second, hovering (or a simulated pointer-over) a later cell shows the preview highlight class on the cells in between without calling `onSelectRange`.
  - clear affordance: clicking the clear control calls `onSelectRange(null)`.
  - regression check: the existing "next office day" input/clear-button behavior still passes unmodified.
- **`App.tsx`** integration (existing top-level test file, if one covers the filter chain — otherwise a new focused test): selecting a range narrows `visibleTodos` passed down to `AgendaGroups`, and composes correctly with an already-active search query and/or category chip selection (all three narrow together, not independently overriding each other).
- Prior art: `packages/frontend/src/utils/dateAgenda.test.ts` (pure-function tests), `packages/frontend/src/components/MiniCalendar.test.tsx` (fake-timers + DOM assertions), `packages/frontend/src/components/AgendaGroups.test.tsx` (grouping/rendering with plain-object todo fixtures).

## Out of Scope

- Any backend/API change — no new query params, no server-side date filtering.
- Multi-range selection (only one contiguous range can be active at a time; starting a new selection replaces the old one).
- Persisting the selected date/range across a page reload (unlike the active-profile choice, which already persists to `localStorage`) — the filter is transient UI state, reset on reload same as search text and category chips are today.
- Changing `AgendaGroups`' bucket definitions or the relative Overdue/Today/Tomorrow/This week/Later logic itself — only the upstream input list changes.
- Any change to how `nextOfficeDay` is set (the existing `<input type="date">` control at the bottom of `MiniCalendar` keeps working exactly as-is).
- Year-level navigation (e.g. jump-to-year picker) — only single-month-at-a-time prev/next, matching `DatePickerPopup`'s existing pattern.
- Touch-specific drag gestures — the click-first-day/hover-preview/click-second-day model is pointer-and-keyboard friendly without needing a distinct touch/drag implementation.

## Further Notes

- Seam and the two UX decisions below were confirmed directly with the user before writing this spec (no prototype or grilling session needed):
  - Client-side-only filtering (extend `MiniCalendar` + a pure `dateAgenda.ts` helper + a third `App.tsx` filter stage) rather than a new backend endpoint.
  - Range selection is click-start → hover-preview → click-end-to-commit, not click-and-drag.
  - The agenda keeps its existing relative-day grouping while a filter is active, rather than switching to a flat sorted list.
- `DatePickerPopup.tsx` (`packages/frontend/src/components/dateBadge/DatePickerPopup.tsx`) is the direct reference implementation for the month-navigation half of this change — its `viewDate`/`changeMonth` state and button markup were built as a variant of `MiniCalendar`'s grid specifically for this kind of interactivity, per its own header comment.
- **Corrected during implementation**: an earlier draft of this spec's decision bullet 5 and user story 16 described a "replace the provisional start" gesture that contradicted the confirmed click-start/hover-preview/click-end-to-commit model (there's no click that's distinguishable as "replace start" rather than "commit as end"). Both were reworded to match the model actually confirmed with the user and built.
- **Resolved styling question**: today/selected/office-day are each expressed on an independent CSS channel (background for today/selected, border for selected, ring for office-day) rather than a mutually-exclusive if/else chain, so any combination of the three composes and stays legible on one cell instead of one silently hiding another.
