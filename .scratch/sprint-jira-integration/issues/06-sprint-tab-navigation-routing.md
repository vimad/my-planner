# Sprint tab navigation & routing

Type: grilling
Status: resolved
Blocked by: 02

## Question

Map is [Sprint (Jira Integration) — Phase 1 Planning Map](../map.md).

Design how the Sprint tab fits into the existing `App.tsx`/`AppShell` routing, given the app currently uses `/:profileSlug/:tab` (see `useActiveProfile.ts`, `profileSlug.ts`) for `TabKey = 'todos' | 'notes' | 'boards'`:

- URL scheme for Sprint: since Sprint is not profile-bound but is team-bound, decide the route shape (e.g. `/sprint/:teamSlug/planning`, `/sprint/:teamSlug/status`, `/sprint/:teamSlug/epics` vs. some other structure) and how it coexists with the `/:profileSlug/:tab` pattern for the other tabs.
- Header switcher swap: confirm the mechanics of swapping `ProfileSwitcher` for a new `TeamSwitcher` in the same header slot when the Sprint tab is active (already agreed in principle — this ticket nails the implementation-level behavior, e.g. how `activeTab`/route state decides which switcher renders).
- "Remember previous profile" behavior: when navigating away from Sprint back to a profile-bound tab, the previously active profile must be restored. Since `activeProfileId` already persists to `localStorage` (`planner-active-profile-id`) and the URL reconciliation effect currently assumes every route has a `profileSlug`, decide how that effect should behave while on a profile-less Sprint route, and how it reconstructs `/:profileSlug/:tab` on return.
- Similarly decide whether the last-active team should persist (e.g. its own `localStorage` key) so returning to Sprint restores the last team, analogous to profile persistence.
- Confirm the Sprint tab's sub-navigation (Planning / Status / Epics) — tabs within the tab, a further route segment, or something else.

Blocked by ticket 02, since "team" needs to exist as a concrete entity (with something slug-able) before routing around it can be designed.

## Answer

**URL scheme.** Sprint gets its own top-level branch, not a slot in `/:profileSlug/:tab`:

```
/sprint                            — no team resolved yet; resolves last-active team (see below) and redirects
/sprint/:teamSlug                  — redirects to .../planning
/sprint/:teamSlug/planning
/sprint/:teamSlug/status
/sprint/:teamSlug/epics
```

`:teamSlug` mirrors `:profileSlug` exactly — same slugification (`profileSlug()`-style lowercase+hyphenate over `Team.name`), same rationale (a name, not an id, is what's readable/shareable in a URL). Note this permanently reserves `sprint` as an unusable profile name — flagged, not enforced by this ticket.

**Coexistence with `/:profileSlug/:tab`: a two-shell split**, not one shell branching internally. `App.tsx`'s `<Routes>` mounts `SprintShell` for `/sprint/*` and the existing `AppShell` (unchanged) for everything else — a hard split at the router level, above the existing catch-all routes. `TabKey` stays `'todos' | 'notes' | 'boards'`; it does not grow a `'sprint'` member, since Sprint was never part of that profile-bound tab rotation. `AppShell`'s existing ~50 pieces of profile/todo/notes/boards state and effects are untouched; `SprintShell` is a clean-room component scoped to team/sprint concerns only.

**Header switcher swap.** A small shared `<Header>` component (logo/wordmark, theme toggle, switcher slot) is extracted and rendered by both shells, taking the switcher (`ProfileSwitcher` vs. a new `TeamSwitcher`) as a prop/children. The swap is "which shell — and which `<Header>` instance — is mounted," not a runtime `isSprintRoute` conditional threaded through one giant component.

**Returning from Sprint to a profile-bound tab.** Resolved almost entirely as a consequence of the two-shell split: since `AppShell` (and its URL-reconciliation effect) only ever mounts on non-`/sprint/*` routes, that effect never runs while on Sprint — there's no "profile-less route" case to special-case inside it. What's left: `SprintShell`'s `<Header>` includes a "back to app" affordance (e.g. clicking the wordmark) that calls `navigate('/')`. On mount at `/`, `AppShell`'s existing reconciliation effect (the "state → URL" branch) handles the rest with zero new code — it already treats a bare `/` as "resolve `activeProfileId` from `localStorage`, push `/${slug}/todos`" for the initial-load case, and returning from Sprint hits that exact same path. Landing tab is always `todos`; the last-open tab is not separately remembered, consistent with today's behavior (`activeTab` has never been persisted — it's purely URL-derived, and any tab-less route already falls back to `'todos'` via `isTabKey`). Only the profile was ever a stated persistence requirement.

**Last-active team persistence.** Mirrors `activeProfileId` exactly: a new `localStorage` key (`planner-active-team-id`), read/written by a new `useActiveTeam` hook structurally parallel to `useActiveProfile` (fetch the team list, resolve the stored id, fall back to the first team if unset/stale, expose `setActiveTeamId`). `SprintShell` reconciles its own URL ⇄ state the same way `AppShell` does for profile: bare `/sprint` resolves the last team from storage and redirects; an explicit `:teamSlug` in the URL that differs from the stored one is adopted and persisted. No per-team last-active-sub-view persistence — bare `/sprint/:teamSlug` always redirects to `.../planning`.

**Sub-navigation (Planning / Status / Epics).** A tab-pill row directly under the header inside `SprintShell`, visually identical to the existing Todos/Notes/Boards `role="tablist"` pill row in `App.tsx` (same gradient-active-pill treatment, per `docs/ui-conventions.md`'s "copy the existing archetype" rule) — driven by the sub-view route segment instead of `activeTab` state.
