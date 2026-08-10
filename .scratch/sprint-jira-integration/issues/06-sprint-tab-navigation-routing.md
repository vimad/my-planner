# Sprint tab navigation & routing

Type: grilling
Status: open
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
