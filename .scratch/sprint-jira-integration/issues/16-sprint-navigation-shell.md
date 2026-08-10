# 16 — Sprint navigation shell

**What to build:** The Sprint tab's entry point into the app — routing, the two-shell split, the team switcher, and team creation/editing — with stub Planning/Status/Epics pages behind it. Demoable: from the existing app, reach `/sprint`, create a team via "Manage teams", switch into it, and navigate its three (stub) sub-views, all without touching `AppShell`'s existing behavior. See `.scratch/sprint-jira-integration/spec.md` ("Navigation & routing", "Team & person management flow — team creation & label config").

**Blocked by:** 12 — Team, Person & TeamMembership: models + CRUD API.

**Status:** ready-for-agent

- [ ] `packages/frontend/src/utils/teamSlug.ts` — mirrors `profileSlug.ts` exactly (lowercase+hyphenate over `Team.name`).
- [ ] `packages/frontend/src/hooks/useActiveTeam.ts` — structurally parallel to `useActiveProfile.ts`: fetches the team list, resolves the active id from a new `localStorage` key `planner-active-team-id`, falls back to the first team if unset/stale, exposes `setActiveTeamId`.
- [ ] A shared `packages/frontend/src/components/Header.tsx` extracted from `AppShell` (logo/wordmark, theme toggle, a switcher slot taking `ProfileSwitcher` or the new `TeamSwitcher` as a prop/children) — `AppShell`'s existing rendering is otherwise untouched.
- [ ] `packages/frontend/src/components/TeamSwitcher.tsx` — visually mirrors `ProfileSwitcher.tsx`: lists teams, switches the active one, and exposes a gear-icon "Manage teams" panel (create/rename/delete team, edit `jiraLabels` inline) hitting ticket 12's `/api/teams` routes.
- [ ] `App.tsx`'s `<Routes>` gains a hard top-level split: a new `SprintShell` component mounts on `/sprint/*`; the existing `AppShell` mounts on everything else, unchanged. `TabKey` does **not** grow a `'sprint'` member.
- [ ] Routing inside `SprintShell`: `/sprint` (resolves last-active team via `useActiveTeam`, redirects), `/sprint/:teamSlug` (redirects to `.../planning`), `/sprint/:teamSlug/planning`, `/sprint/:teamSlug/status`, `/sprint/:teamSlug/epics` — the latter three render stub placeholder content for now (built out in tickets 18, 20, 21).
- [ ] A sub-nav tab-pill row (Planning / Status / Epics) directly under `SprintShell`'s `<Header>`, visually identical to the existing Todos/Notes/Boards pill row per `docs/ui-conventions.md`, driven by the route segment.
- [ ] A "back to app" affordance in `SprintShell`'s header (e.g. clicking the wordmark) that calls `navigate('/')` — relies on `AppShell`'s existing URL-reconciliation effect to resolve the return (no new code needed there; confirm no regression).
- [ ] Frontend tests cover: `useActiveTeam`'s fallback/persistence behavior (mirroring any existing `useActiveProfile` tests), the `/sprint` → `/sprint/:teamSlug/planning` redirect chain, that `AppShell`'s existing routes/behavior are unaffected, and that "Manage teams" create/rename/delete round-trips through ticket 12's API.
