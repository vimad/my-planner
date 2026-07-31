# 03 — Profile rename & delete UI, with cascade-delete confirmation

**What to build:** Rename and delete affordances for profiles from the switcher, with an explicit confirmation before a destructive cascade delete, and the last-remaining-profile guard surfaced in the UI (not just enforced server-side). See `.scratch/profiles/spec.md` for full context.

**Blocked by:** 02 — Profile switcher + category scoping.

- [x] Rename a profile from the switcher/management UI (`PATCH /api/profiles/:id`).
- [x] Delete a profile from the switcher/management UI (`DELETE /api/profiles/:id`), gated behind an explicit confirmation naming what will be lost (e.g. "Delete Work and its 12 todos?" — categories/todos/notes counts).
- [x] Delete action is disabled (with an explanatory affordance, e.g. disabled state/tooltip) when it's the only remaining profile, matching the backend's last-profile guard.
- [x] Deleting the currently-active profile leaves the app in a valid state afterward (switches active profile to one of the remaining profiles, updates `localStorage` accordingly).
- [x] Frontend test covers: rename flow, delete confirmation flow (including the cascade-count messaging), delete-disabled-when-last-profile, and active-profile reassignment after deleting the active one.

## Answer

Rename/delete are implemented, backed by `useActiveProfile`'s `renameProfile`/`deleteProfile` (PATCH/DELETE against `/api/profiles/:id`) and `App.tsx`'s `handleDeleteProfileRequest`, which fetches the target profile's categories (already profile-scoped) to build a real "X categories, Y todos, plus any scratch notes" confirmation message before calling `requestConfirm`.

The interaction design for *where* rename/delete live went through a `/prototype` comparison first, since the first pass (inline "Edit"/"Delete" text buttons sitting directly on every tab) looked cluttered. Three structurally different options were built and run against real data via a `?variant=` switch on the dashboard route:

- **A — kebab menu on the active tab only.**
- **B — separate "Manage profiles" panel** (clean tab row; a gear icon opens a panel listing every profile with inline rename + delete).
- **C — hover-reveal overflow trigger per tab.**

**B won** — switching (the frequent action) stays a completely clean tab row; rename/delete (rare, and delete is destructive) live behind a deliberate "Manage profiles" step instead of being one accidental click away on every tab.

The full three-variant prototype (and the throwaway `App.tsx` wiring used to compare them against real data) is preserved as a primary source on branch `prototype/profile-switcher-variants` — not folded into `main`, which only carries the winning design (`ProfileSwitcher.tsx`'s "Manage profiles" panel).

Status: resolved.
