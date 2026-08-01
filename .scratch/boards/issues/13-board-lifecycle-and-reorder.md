# 13 — Board rename, delete, and drag-to-reorder cards

**What to build:** Lifecycle and ordering affordances on top of the browse/edit grid from ticket 12 — renaming a board, deleting a board (with the right confirm copy and active-board fallback), and manually reordering cards within a board. See `.scratch/boards/spec.md` for full context.

**Blocked by:** 12 — Boards tab: browse boards, card grid, inline editing.

**Status:** ready-for-agent

- [ ] Inline rename affordance (pencil/edit icon) in the Boards view header, near the switcher — no confirm dialog, saves via `PATCH /api/boards/:id`.
- [ ] Delete-board affordance gated behind `ConfirmDialog` with copy stating items are *not* destroyed: `Delete "<board name>"? Its N item(s) will not be deleted — only this board and its references to them.` (N = combined todo+note count), then calls `DELETE /api/boards/:id`.
- [ ] After a successful board delete, if the deleted board was active, the UI reflects the new `Profile.activeBoardId` the backend fell back to (next board by creation order, or the "no active board" / zero-boards state if none remain) — no client-side guessing, just re-read what the backend returns.
- [ ] Cards within the grid are manually drag-to-reordered (dnd-kit, same pattern as the existing Linked Todos reorder: visible drag handle, drop-position preview, keyboard arrow-key support), persisted immediately via `PATCH /api/boards/:id` with the whole reordered `items` array, no separate save step, no special handling needed beyond what ticket 12's dangling-ref placeholder already covers for gaps in the order.
- [ ] Frontend tests cover: inline rename saves without a confirm prompt, delete-board confirm shows the correct item count and calls DELETE, UI updates correctly when the active board is deleted and falls back to another board vs. to the empty/no-boards state, and drag-reorder persists the new order (including reordering across mixed todo/note cards).
