# 01 — Profile entity: model, CRUD API, seeding & migration

**What to build:** A new `Profile` entity that Categories and ScratchNotes belong to, with full backend CRUD, boot-time seeding, and migration of the existing (pre-Profile) data onto a default "Work" profile. This ticket is backend-only — no UI — verified via API calls and tests. See `.scratch/profiles/spec.md` for full context.

**Blocked by:** None — can start immediately.

- [ ] `Profile` Mongoose model: `name` (required), `color` (optional), `createdAt`/`updatedAt`.
- [ ] `/api/profiles` routes: `POST` (create), `GET` (list), `PATCH /:id` (rename/recolor), `DELETE /:id`.
- [ ] `DELETE /api/profiles/:id` is blocked (400) when it's the only remaining profile.
- [ ] `DELETE /api/profiles/:id` on a non-last profile cascade-deletes its Categories, Todos (via those categories), and ScratchNotes.
- [ ] `Category` model gains a required `profileId` (ref `Profile`).
- [ ] `ScratchNote` model gains a required `profileId` (ref `Profile`), set directly (not derived).
- [ ] Boot-time seed (extending `seed.ts`/`defaultCategory.ts`'s existing idempotent pattern): find-or-create a Profile named "Work"; backfill `profileId: <Work's id>` onto any Category or ScratchNote that doesn't already have one. Idempotent — running boot twice doesn't duplicate or reassign.
- [ ] Creating a new Profile automatically seeds that profile's own non-deletable "Uncategorized" category (`system: true`, scoped by the new `profileId`) — extends the existing `seedUncategorizedCategory()` pattern to run per-profile instead of once globally.
- [ ] Backend tests (HTTP layer via `createApp()` + `supertest`, mirroring `categories.route.test.ts`) cover: Profile CRUD, the last-profile delete guard, cascade delete, the Work-profile boot migration (including idempotency), and per-profile Uncategorized seeding on profile creation.
