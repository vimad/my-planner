# 03 — Profile rename & delete UI, with cascade-delete confirmation

**What to build:** Rename and delete affordances for profiles from the switcher, with an explicit confirmation before a destructive cascade delete, and the last-remaining-profile guard surfaced in the UI (not just enforced server-side). See `.scratch/profiles/spec.md` for full context.

**Blocked by:** 02 — Profile switcher + category scoping.

- [ ] Rename a profile from the switcher/management UI (`PATCH /api/profiles/:id`).
- [ ] Delete a profile from the switcher/management UI (`DELETE /api/profiles/:id`), gated behind an explicit confirmation naming what will be lost (e.g. "Delete Work and its 12 todos?" — categories/todos/notes counts).
- [ ] Delete action is disabled (with an explanatory affordance, e.g. disabled state/tooltip) when it's the only remaining profile, matching the backend's last-profile guard.
- [ ] Deleting the currently-active profile leaves the app in a valid state afterward (switches active profile to one of the remaining profiles, updates `localStorage` accordingly).
- [ ] Frontend test covers: rename flow, delete confirmation flow (including the cascade-count messaging), delete-disabled-when-last-profile, and active-profile reassignment after deleting the active one.
