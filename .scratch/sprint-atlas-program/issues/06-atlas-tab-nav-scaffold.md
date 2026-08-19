# 06 — Atlas tab & nav scaffold

**What to build:** A new "Atlas" tab appears in the Sprint section's tab row, alongside Planning/Status, and is clickable and visible **regardless of whether a team is selected** — unlike Planning/Status, which only render once a team is active. Clicking it navigates to an Atlas page (`/sprint/atlas`, sibling to the team-scoped `:teamSlug/*` route) showing an empty "no epics tracked yet" state with an epic-key text input (not wired to sync yet — that's ticket 08).

This requires a genuine prefactor, not just a new menu item: `SprintShell.tsx`'s tab row currently only renders inside `{activeTeam && (...)}`, and its only routes are `index` (redirects to the last-active team) and `:teamSlug/*` (Planning/Status). Restructure so:
- The tab row renders unconditionally, with Atlas always present; Planning/Status pills only appear/apply when a team is active (their current behavior, preserved).
- A new top-level `Route path="atlas"` sits beside `index` and `:teamSlug/*`.
- `activeTab` derivation and the tab-click navigation handle the team-scoped case (`/sprint/:teamSlug/planning|status`) and the team-independent case (`/sprint/atlas`) without one clobbering the other.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] "Atlas" tab is visible in the Sprint tab row with no team selected (e.g. before any team exists, or via direct navigation to `/sprint/atlas`)
- [ ] "Atlas" tab is visible and clickable with a team selected, without disturbing Planning/Status's existing team-scoped behavior
- [ ] Navigating to `/sprint/atlas` renders an empty-state Atlas page (no epics tracked, epic-key input present but inert)
- [ ] Switching teams while on the Atlas tab does not navigate away from Atlas or change what it shows
- [ ] Existing Planning/Status tab behavior (team switching, tab highlighting, redirects) is unchanged
