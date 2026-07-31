# 04 — Scope todos, dashboard, tags & search to the active profile

**What to build:** The dashboard (agenda, mini calendar, category summary strip), todo quick-add, tag autocomplete, and search all scoped to the active profile, so switching profiles fully switches what the dashboard shows. See `.scratch/profiles/spec.md` for full context.

**Blocked by:** 02 — Profile switcher + category scoping.

- [ ] `GET /api/todos` (and any agenda-grouping endpoint), `GET /api/todos/tags`, and `GET /api/todos/search` are all scoped to the active profile — filtered transitively via `categoryId → Category.profileId` (a todo has no direct `profileId`).
- [ ] Todo quick-add defaults new todos to the active profile's own "Uncategorized" category (not any other profile's).
- [ ] Dashboard agenda groups (Overdue/Today/Tomorrow/This week/Later/No date), the mini calendar's due-date markers, and the category summary strip all only reflect the active profile's todos.
- [ ] Tag autocomplete only suggests tags used within the active profile — no cross-profile tag suggestions.
- [ ] Search results only include todos from the active profile.
- [ ] Switching profiles immediately re-scopes the dashboard, quick-add default category, tag suggestions, and search — no stale cross-profile data left visible.
- [ ] Backend tests cover the now-scoped `/api/todos`, `/api/todos/tags`, `/api/todos/search` routes (profile A's todos/tags never returned when profile B is active).
- [ ] Frontend tests cover: dashboard rendering scoped to active profile, quick-add's default category, and that switching profiles updates the agenda/calendar/search results.
