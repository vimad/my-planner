# 06 — Move, rename folders, and delete (with confirms)

**What to build:** Organizing affordances on top of the browse/create/edit tree from ticket 05 — moving items between folders, renaming folders, and deleting either kind of item with an appropriate confirm. See `.scratch/notes-section/spec.md` for full context.

**Blocked by:** 05 — Notes tab: browse, create, and edit notes.

**Status:** ready-for-agent

- [ ] Every tree row (folder or note) gets a hover-reveal "Move" action opening a picker (a modal listing the folder tree — pick a destination, confirm) that reassigns the item's `parentId`/`folderId` via `PATCH`. No drag-and-drop.
- [ ] The move picker excludes a folder from being moved into itself or any of its own descendants.
- [ ] Folder rows get a hover-reveal "Rename" action that turns the row's label into an inline text input, saving via `PATCH /api/note-folders/:id`.
- [ ] Every tree row gets a hover-reveal "Delete" action.
- [ ] Deleting a note shows a `requestConfirm` prompt (`Delete "<name>"? This cannot be undone.`) before calling `DELETE /api/notes/:id` — matches every other delete in this app.
- [ ] Deleting a folder shows a `requestConfirm` prompt stating the count of what will be destroyed (e.g. "Delete 'Recipes' and everything in it — 4 notes, 2 folders?") before calling `DELETE /api/note-folders/:id`.
- [ ] If the note currently open in the right pane was deleted, or was inside a folder that got deleted, the right pane returns to the empty-state placeholder.
- [ ] Frontend tests cover: move reassigns a note/folder and the picker excludes a folder's own descendants, folder inline rename, note delete confirm flow, folder cascade delete confirm flow (including the destroyed-item count in the message), and the right-pane reset when the open note is deleted out from under it.
