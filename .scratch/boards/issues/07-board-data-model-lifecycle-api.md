Type: grilling
Status: open

## Question

Decide the Board data model, lifecycle UX, and API surface:

- **Schema:** `profileId` scoping (matching `Category`/`Todo`/`ScratchNote`), `name`, an ordered item list referencing todos/notes by type + id (following the `Todo.linkedTodoIds` reference-list precedent — flat array, no-cascade, frontend tolerates dangling refs), and the single active-board flag/pointer (per [Add-to-board & active-board mechanics](02-add-to-board-and-active-board-mechanics.md)) — does it live on the Board document (`isActive: boolean`, enforced-one-true) or elsewhere (e.g. a pointer on a per-profile settings document)?
- **REST routes:** CRUD for boards; add/remove an item; reorder an item within a board — following the existing one-route-file-per-entity convention, and the `PATCH`-whole-array pattern already used for `linkedTodoIds`/reorder persistence.
- **No-cascade invariant:** deleting/completing a todo, or deleting a note, must never touch any board — same invariant already documented and enforced for Linked Todos, needs the same one-line schema comment treatment here.
- **Lifecycle UX:** renaming a board; deleting a board (confirm-dialog copy stating what's destroyed — deleting a board never deletes its items, only the board and its references, consistent with the no-cascade invariant); what happens when the **active** board itself is deleted (falls back to another existing board, or an explicit "no active board" state if none remain); how boards are ordered in the switcher dropdown (creation order, alphabetical, or manually reorderable).
