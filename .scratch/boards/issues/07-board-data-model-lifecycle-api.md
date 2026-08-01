Type: grilling
Status: resolved

## Question

Decide the Board data model, lifecycle UX, and API surface:

- **Schema:** `profileId` scoping (matching `Category`/`Todo`/`ScratchNote`), `name`, an ordered item list referencing todos/notes by type + id (following the `Todo.linkedTodoIds` reference-list precedent — flat array, no-cascade, frontend tolerates dangling refs), and the single active-board flag/pointer (per [Add-to-board & active-board mechanics](02-add-to-board-and-active-board-mechanics.md)) — does it live on the Board document (`isActive: boolean`, enforced-one-true) or elsewhere (e.g. a pointer on a per-profile settings document)?
- **REST routes:** CRUD for boards; add/remove an item; reorder an item within a board — following the existing one-route-file-per-entity convention, and the `PATCH`-whole-array pattern already used for `linkedTodoIds`/reorder persistence.
- **No-cascade invariant:** deleting/completing a todo, or deleting a note, must never touch any board — same invariant already documented and enforced for Linked Todos, needs the same one-line schema comment treatment here.
- **Lifecycle UX:** renaming a board; deleting a board (confirm-dialog copy stating what's destroyed — deleting a board never deletes its items, only the board and its references, consistent with the no-cascade invariant); what happens when the **active** board itself is deleted (falls back to another existing board, or an explicit "no active board" state if none remain); how boards are ordered in the switcher dropdown (creation order, alphabetical, or manually reorderable).

## Answer

- **Active-board pointer:** `activeBoardId: Types.ObjectId | null` lives directly on the **`Profile`** document — not an `isActive` boolean on `Board`, and not a new per-profile settings entity. `Settings` today is an explicit app-wide singleton (`nextOfficeDay`), a mismatch for per-profile state; `Profile` is already the per-profile root document, so it's the natural home. A pointer is also a single source of truth — switching active board is one write, vs. a boolean flag needing "unset old, set new" (two writes or a uniqueness constraint). "No active board" falls out naturally as `null`.
- **Board schema:**
  ```ts
  export type BoardItemType = 'Todo' | 'Note'
  export interface BoardItem {
    itemType: BoardItemType
    itemId: Types.ObjectId
  }
  export interface BoardDoc {
    name: string
    profileId: Types.ObjectId
    items: BoardItem[]
    createdAt: Date
    updatedAt: Date
  }
  ```
  `items` is a flat, ordered array of embedded subdocuments (`{ _id: false }`, same treatment as `recurrenceSchema`/`lineSchema`) — array position **is** display order, no separate order field, matching `linkedTodoIds`. Unlike `linkedTodoIds` (homogeneous `Todo` refs), board items are heterogeneous (todo or note) and must be drag-reordered together in one unified grid per [Boards view UI shape](03-boards-view-ui-shape.md), so a single array of `{itemType, itemId}` is required — two separate `todoIds`/`noteIds` arrays would lose cross-type ordering. `itemId` uses Mongoose's dynamic `refPath: 'items.itemType'`, so `itemType`'s values are the literal model names (`'Todo'`/`'Note'`) rather than a lowercase enum that would need translating before use as a ref.
- **REST routes** (`packages/backend/src/routes/boards.ts` + `models/Board.ts`, following the one-file-per-entity convention):
  - `POST /api/boards` — create (`name`, `profileId`)
  - `GET /api/boards?profileId=...` — list a profile's boards, items embedded; no separate `GET /:id` (mirrors `todos.ts`, which has no singular-get either — the frontend works off the list)
  - `PATCH /api/boards/:id` — general update: `name` (rename) and/or `items` (whole-array replace). One route covers add/remove/reorder, exactly like `linkedTodoIds` — the frontend computes the new full array client-side and PATCHes it whole. No dedicated add-item/remove-item/reorder endpoints.
  - `DELETE /api/boards/:id` — delete the board itself only (no cascade)
  - Setting the *active* board reuses the existing `PATCH /api/profiles/:id`, extended to accept `activeBoardId` — no new boards-specific endpoint, since the pointer lives on `Profile`.
- **No-cascade invariant:** purely applying the existing pattern, nothing new to decide. Deleting a todo, deleting a note, or completing a todo must never touch any `Board.items` — dangling `itemId`s are left in place (frontend already confirmed it tolerates these, per [Board grid & card design](05-board-grid-and-card-design-prototype.md)'s dangling-ref placeholder). Deleting a board must never delete the todos/notes it references — only the `Board` document (and `Profile.activeBoardId`, if it pointed there) are touched. `items` gets the same one-line no-cascade schema comment as `Todo.linkedTodoIds`.
- **Renaming a board:** no confirm dialog — same treatment as category/profile rename (low-stakes, reversible, not destructive). Inline rename affordance (pencil/edit icon) lives in the Boards view header, near the board switcher dropdown from [Boards view UI shape](03-boards-view-ui-shape.md).
- **Delete-board confirm copy:** inverts the existing cascade-delete pattern (profile/note-folder dialogs list what *will* be destroyed) since boards destroy nothing downstream:
  > `Delete "<board name>"? Its N item(s) will not be deleted — only this board and its references to them.`
  Single combined item count across todos+notes — no need to split by type, unlike the folder-delete copy (which splits because folder vs. note counts imply different consequences).
- **Active board deleted:** if any boards remain after the delete, the **first remaining board in creation order** (same order as the switcher list) becomes active — deterministic, no new "last viewed" tracking needed. If none remain, `Profile.activeBoardId` → `null`, the same "no active board" state a fresh profile starts in (per [Add-to-board & active-board mechanics](02-add-to-board-and-active-board-mechanics.md)'s "zero boards yet" case).
- **Switcher ordering:** creation order (`createdAt` ascending, `Board.find({ profileId }).sort({ createdAt: 1 })`), no manual reordering of boards themselves — consistent with the existing categories/profiles precedent (both sorted by `createdAt` ascending with no manual reorder; manual drag-reorder in this app only ever applies to *items within* an entity — linked todos, and now board items — never to entities themselves).
