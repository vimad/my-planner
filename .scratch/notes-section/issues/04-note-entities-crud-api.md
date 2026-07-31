# 04 — Note & NoteFolder entities: models + full CRUD API

**What to build:** The backend foundation for Notes — `NoteFolder` and `Note` Mongoose models and their full CRUD routes, profile-scoped and ownership-checked the same way `Category` already is. This ticket is backend-only — no UI — verified via API calls and tests. See `.scratch/notes-section/spec.md` for full context.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] `NoteFolder` Mongoose model: `name` (required), `parentId` (nullable, self-ref), `profileId` (required, ref `Profile`), `createdAt`/`updatedAt`.
- [ ] `Note` Mongoose model: `name` (required), `folderId` (nullable, ref `NoteFolder`), `body` (Tiptap `JSONContent`), `profileId` (required, ref `Profile`), `createdAt`/`updatedAt`.
- [ ] `/api/note-folders` routes: `POST` (create), `GET ?profileId=` (list, flat — client assembles the tree from `parentId`), `PATCH /:id?profileId=` (rename and/or reparent via `parentId`, including moving to root with `parentId: null`), `DELETE /:id?profileId=` (cascades: recursively deletes every descendant folder and every note inside this folder or any descendant, mirroring `profiles.ts`'s cascade delete).
- [ ] `/api/notes` routes: `POST` (create), `GET ?profileId=` (list, flat), `PATCH /:id?profileId=` (rename, move via `folderId`, and/or update `body` — one endpoint for all three, matching `ScratchNote`'s pattern), `DELETE /:id?profileId=`.
- [ ] All list/mutate routes require `profileId` (`requireProfileId` from `utils/profileScope.ts`) and check it against the document's own `profileId`, returning 404 (not 403) on a mismatch — mirrors `categories.ts`.
- [ ] No uniqueness constraint enforced on `name` for either entity, among siblings or otherwise.
- [ ] Root-level creation/listing works for both entities (`parentId`/`folderId: null`).
- [ ] Backend tests (HTTP layer via `createApp()` + `supertest`, mirroring `categories.route.test.ts`/`profiles.route.test.ts`) cover: CRUD for both entities, folder cascade delete (descendant folders + notes all removed, verified via a multi-level nested fixture), profile-ownership checks (cross-profile access returns 404), and root-level create/list.
