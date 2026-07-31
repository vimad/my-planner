# 02 — Profile switcher + category scoping

**What to build:** A persistent profile switcher in the dashboard header, and category list/create/rename/delete/counts scoped to whichever profile is active — the first end-to-end demoable behavior of this feature (switching profiles visibly changes which categories you see). See `.scratch/profiles/spec.md` for full context.

**Blocked by:** 01 — Profile entity: model, CRUD API, seeding & migration.

- [ ] Profile switcher component in the dashboard header: lists all profiles (via `GET /api/profiles`), lets the user pick the active one.
- [ ] Switcher includes creating a new profile (name required) inline, so there's something besides "Work" to switch to.
- [ ] Active profile choice persists to `localStorage` and is restored on reload. No URL/route change on switch.
- [ ] `GET /api/categories` (and its counts), `POST /api/categories`, `PATCH /api/categories/:id`, `DELETE /api/categories/:id` are all scoped to a `profileId` (query param or equivalent) — only categories belonging to that profile are returned/affected.
- [ ] Frontend category list, category summary strip, and category create/edit forms only show/act on the active profile's categories.
- [ ] A category created while a given profile is active is automatically attached to that profile (no manual profile picker on the category form).
- [ ] Frontend test (RTL + Vitest, mocking `fetch`, mirroring existing component tests) covers: switcher renders profiles, switching re-fetches category data scoped to the new profile, persists/restores via `localStorage`.
- [ ] Backend test coverage for the now-scoped category routes (profile A's categories never returned when profile B is active).
