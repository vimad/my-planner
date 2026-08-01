# 09 — Summary tab UI (category dashboard + week nav)

**What to build:** From any profile, the user can open a 4th "Summary" tab and see that week's per-category progress — broken into completed / action taken / no action — and navigate to other weeks.

**Blocked by:** 08 — `GET /api/todos/weekly-summary` endpoint

**Status:** done

- [x] A 4th tab (`'summary'`) added to `App.tsx`'s tab strip, styled identically to Todos/Notes/Boards
- [x] Category cards show a rollup line (`N actioned · N no-action · N completed`) and expand/collapse to reveal the three bucket lists
- [x] Categories with zero todos across all three buckets for the week are hidden entirely
- [x] Actioned todos show every dated segment for the week as its own row (date + text), not just the latest
- [x] Completed todos show a strikethrough title plus a completion-date badge, and an italic "Last update" line when `lastSegmentBeforeCompletion` is present
- [x] No-action todos render as a flat wrap of plain title pills — low-emphasis, no detail
- [x] Prev/next week navigation, plus a "This week" jump button that only appears when viewing a week other than the current one
- [x] Wired to the real `GET /api/todos/weekly-summary` endpoint — no mock data
- [x] Manually verified live in-browser against the `Test` profile (per this repo's manual-verification convention), covering all three buckets and week navigation

## Result

Implemented in `packages/frontend/src/components/SummaryView.tsx` (+ `hooks/useWeeklySummary.ts`, `utils/weekDates.ts`), porting the validated `prototype/weekly-summary-view` design onto the real endpoint. `App.tsx`'s `activeTab` union and tab strip extended with `'summary'`. Covered by `SummaryView.test.tsx` (8 tests, mocked fetch) plus `pnpm test` (full suite, 209 backend + 248 frontend, all passing).

Manually verified live in the `Test` profile: created todos with dated-badge segments (some in-week, some out-of-week) plus one toggled complete, confirmed all three buckets rendered correctly (rollup counts, multi-segment actioned rows, completed strikethrough + "Last update" carry-over line, no-action pills), and confirmed prev/next/"This week" navigation re-fetches and updates the displayed week correctly. One real gotcha found and corrected during verification: a date badge must be alone in its own block to start a segment — typing text on the same line as the badge does not (matches the parsing rule in `weeklySummarySegments.ts` exactly, not a bug).
