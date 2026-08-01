# 11 — Board entity: model + full CRUD API, active-board pointer, notes search

**What to build:** The backend foundation for Boards — the `Board` Mongoose model and its full CRUD routes, `Profile.activeBoardId`, and the new notes-search endpoint that powers the Boards search-to-add bar. This ticket is backend-only — no UI — verified via API calls and tests. See `.scratch/boards/spec.md` for full context.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] `Board` Mongoose model (`packages/backend/src/models/Board.ts`): `name` (required), `profileId` (required, ref `Profile`), `items` (array of `{ itemType: 'Todo' | 'Note', itemId }` subdocs, `{ _id: false }`, `itemId` using `refPath: 'items.itemType'`), `createdAt`/`updatedAt`. One-line no-cascade schema comment on `items`, matching `Todo.linkedTodoIds`'s treatment.
- [ ] `Profile` model gains `activeBoardId: Types.ObjectId | null` (ref `Board`, default `null`).
- [ ] `/api/boards` routes (`packages/backend/src/routes/boards.ts`), profile-scoped and ownership-checked the same way `categories.ts`/`notes.ts` are (`profileId` required as query param, checked against the document's own `profileId`, 404 not 403 on mismatch):
  - `POST /api/boards` — body `{ name, profileId }`, creates an empty board.
  - `GET /api/boards?profileId=` — lists a profile's boards, items embedded, sorted `{ createdAt: 1 }`.
  - `PATCH /api/boards/:id?profileId=` — body `{ name?, items? }`, one endpoint for rename and/or whole-array `items` replace (covers add/remove/reorder).
  - `DELETE /api/boards/:id?profileId=` — deletes the board only, no cascade to the todos/notes it referenced. If the deleted board was the profile's `activeBoardId`, update it: the first remaining board in creation order if any remain, else `null`.
- [ ] `PATCH /api/profiles/:id` accepts `activeBoardId` as an updatable field.
- [ ] `GET /api/notes/search?profileId=...&q=...&excludeIds=...` added to `notes.ts`, registered before its `/:id` routes: case-insensitive substring match on `name` only, empty/missing `q` returns unfiltered, `excludeIds` (comma-separated) filtered via `$nin` before capping, capped to 6 via `.limit(6)`, sorted `{ createdAt: -1 }`.
- [ ] No uniqueness constraint on board `name`, no cap on boards-per-profile or items-per-board.
- [ ] Backend tests (HTTP layer via `createApp()` + `supertest`, mirroring `categories.route.test.ts`/`todos.route.test.ts`) cover: CRUD for `Board`, whole-array `items` update (add/remove/reorder via PATCH), no-cascade behavior (deleting a linked todo/note leaves the board's `items` entry dangling; deleting a board leaves the referenced todo/note untouched), the active-board-deleted fallback (falls back to the next board by creation order, or `null` when none remain), profile-ownership checks (cross-profile access returns 404), and `GET /api/notes/search` (name match, case-insensitivity, empty query, `excludeIds` exclusion applied before the cap, 6-result cap).
