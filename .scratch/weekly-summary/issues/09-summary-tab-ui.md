# 09 — Summary tab UI (category dashboard + week nav)

**What to build:** From any profile, the user can open a 4th "Summary" tab and see that week's per-category progress — broken into completed / action taken / no action — and navigate to other weeks.

**Blocked by:** 08 — `GET /api/todos/weekly-summary` endpoint

**Status:** ready-for-agent

- [ ] A 4th tab (`'summary'`) added to `App.tsx`'s tab strip, styled identically to Todos/Notes/Boards
- [ ] Category cards show a rollup line (`N actioned · N no-action · N completed`) and expand/collapse to reveal the three bucket lists
- [ ] Categories with zero todos across all three buckets for the week are hidden entirely
- [ ] Actioned todos show every dated segment for the week as its own row (date + text), not just the latest
- [ ] Completed todos show a strikethrough title plus a completion-date badge, and an italic "Last update" line when `lastSegmentBeforeCompletion` is present
- [ ] No-action todos render as a flat wrap of plain title pills — low-emphasis, no detail
- [ ] Prev/next week navigation, plus a "This week" jump button that only appears when viewing a week other than the current one
- [ ] Wired to the real `GET /api/todos/weekly-summary` endpoint — no mock data
- [ ] Manually verified live in-browser against the `Test` profile (per this repo's manual-verification convention), covering all three buckets and week navigation
