# Spec: Reorder Linked Todos

**Status:** ready-for-agent

## Problem Statement

Inside a todo's detail view, the "Todos" tab shows the list of other todos linked to it (see the `linked-todos` feature). Today that list has no user-controlled order — it renders in whatever order the linked todo happens to sit in the app's overall todo list (newest-created first), which is not necessarily the order that matters to the user in that moment. If several todos are linked to one "moment" (e.g. prep items for a meeting), the user has no way to put them in the order they actually intend to work through them, and the order silently shifts whenever an unrelated todo elsewhere in the app is created.

## Solution

Within a todo's detail view, on the Todos tab, the user can drag a linked todo up or down in the list to reorder it relative to the other linked todos. The new order is specific to that parent todo (its own `linkedTodoIds` sequence), persists immediately to the backend as each drag completes, and is what's shown the next time that todo is opened — no separate save step required.

## User Stories

1. As a user viewing a todo's Todos tab, I want to drag a linked todo to a new position in the list, so that the list reflects the order I actually care about (e.g. the sequence I plan to work through them).
2. As a user, I want to drop a dragged linked todo above or below any other entry, so that I can place it exactly where I want, not just swap adjacent items.
3. As a user, I want the list to show a visual preview of where the dragged item will land as I drag it over other entries, so that I can tell where it'll drop before I let go.
4. As a user, I want the new order to persist immediately once I drop, without needing to click the parent todo's own Save button, so that reordering feels like a direct, one-step action — consistent with how the parent's own header stays a compact read-only summary while I'm on this tab.
5. As a user, I want the reordered list to still be in that order the next time I reopen this todo (or reload the page), so that the ordering is a real, persisted feature and not a session-only convenience.
6. As a user, I want to still be able to click a linked todo to select it and view/edit its notes exactly as before, so that adding drag-to-reorder doesn't interfere with the existing select/unlink/notes-edit interactions on the same row.
7. As a user, I want to still be able to unlink a todo via its "×" control without accidentally triggering a drag, so that the two interactions on the same row don't conflict with each other.
8. As a user, I want a visible drag handle (rather than needing to grab the entire row) so that clicking the row to select it and dragging it to reorder it are clearly two different affordances.
9. As a user reordering with a keyboard (via the drag handle's focus), I want to move a linked todo up or down using arrow keys, so that reordering isn't limited to mouse/pointer drag.
10. As a user, I want reordering one linked todo to never affect the parent todo's own fields (title, priority, due date, etc.) or any other linked todo's notes, so that this is a purely additive interaction with no side effects elsewhere in the view.
11. As a user, I want reordering to never change which linked todo is currently selected (shown in the right-hand notes panel), so that I don't lose my place in the notes I'm reading/editing while I reorder the list on the left.
12. As a user, I want the reorder action to leave the target linked todo's own document (its title, body, completion state, etc.) completely untouched — only its position in this parent's `linkedTodoIds` list changes, so that reordering can never be mistaken for an edit to the linked todo itself.
13. As a user, I want reordering to work correctly even if the linked list contains a dangling reference (a linked id whose todo has since been deleted and is hidden from the rendered list), so that an invisible, unresolvable entry doesn't shift or break visible positions when I drag.
14. As a developer, I want the reorder persistence to reuse the existing general-purpose `PATCH /api/todos/:id` route (same as link/unlink already does for `linkedTodoIds`), so that there isn't a new, parallel endpoint just for changing order.
15. As a user, I want a failed reorder save (e.g. a network error) to be communicated to me and the list to fall back to the last known-good order, so that the UI never silently claims a reorder succeeded when it didn't.
16. As a user with only one or zero linked todos, I want the drag handle to simply have no effect (nothing to reorder against), so that the feature degrades gracefully rather than erroring on a trivial list.

## Implementation Decisions

- **Order becomes explicit and authoritative**: today the rendered `linked` list in `TodoDetail` is derived by filtering the app's full `todos` list for membership in `linkedTodoIds` — which means today's render order is actually the full todo list's order (newest-created-first), not `linkedTodoIds`'s own array order. This feature changes that derivation so `linkedTodoIds` array order becomes the source of truth for render order: the linked list is built by mapping `linkedTodoIds` in order to their matching todo (skipping any id that no longer resolves to a real todo — the existing dangling-reference tolerance). This is a visible behavior change independent of drag-and-drop itself and must ship as part of this feature (without it, dragging would have no visible effect).
- **Persistence model — immediate, per-drop, independent of parent Save**: dropping a dragged linked todo into a new position immediately PATCHes the parent todo's `linkedTodoIds` (the full reordered array) to `PATCH /api/todos/:id`, the same existing route already used for link/unlink and for saving a linked todo's own notes. This is independent of the parent's own Save/Cancel footer — the same "save this one thing without closing or resetting the rest of the popup" pattern already used for linked-notes saving (`onSaveLinkedTodo`-style plumbing), not the "stage until parent Save" pattern used for link/unlink today. A new save path (e.g. `onReorderLinkedTodos`) is added to that same family, distinct from `onSave` (parent fields) and `onSaveLinkedTodo` (one linked todo's notes).
- **Optimistic UI with rollback**: the list reorders immediately in local state on drop (so the drag feels instant), and the PATCH fires in the background. If the PATCH fails, the local order reverts to the last confirmed-good order and an error is surfaced to the user (consistent with how other save failures in this view should be handled — check existing error-surfacing conventions in `TodoDetail`/`App.jsx` and reuse them rather than introducing a new error UI pattern).
- **No effect on selection or other state**: reordering must not change `selectedLinkedId`, must not touch any linked todo's own document (title/body/completion/etc.), and must not touch the parent todo's own editable fields. Only the parent's `linkedTodoIds` array (order of ids, same membership) is written.
- **Library**: adopt `@dnd-kit/core` and `@dnd-kit/sortable` as new frontend dependencies (React-19-compatible; no existing DnD library or pattern exists anywhere in this codebase today, so this is a net-new choice, not a reuse of an existing pattern). Each linked-todo row gets a dedicated drag handle element (not the whole row) so that the existing click-to-select and click-to-unlink interactions on that row are unaffected — the handle is the only draggable/sortable affordance. dnd-kit's built-in keyboard sensor is used to satisfy keyboard-driven reordering (arrow keys while the handle has focus) without extra custom logic.
- **Dangling references excluded from the drag surface**: since dangling `linkedTodoIds` entries are already hidden from the rendered list (they don't resolve to a real todo), they're naturally excluded from the sortable list too. When a reorder is persisted, the PATCH must send back the *full* `linkedTodoIds` array including any dangling ids left in their relative position (don't let a reorder silently prune dangling references as a side effect — that's a separate concern from this feature and stays out of scope).
- **API contract — no new route**: `PATCH /api/todos/:id` already accepts and persists `linkedTodoIds` wholesale (`if (linkedTodoIds !== undefined) update.linkedTodoIds = linkedTodoIds`). Reordering reuses this exact same mechanism — the frontend computes the new full-array order client-side and PATCHes it back, identical in shape to how link/unlink already persist, just now firing immediately per-drop instead of only on parent Save.

## Testing Decisions

- Good tests here assert observable behavior (rendered order, API call shapes, DOM roles/labels) — not dnd-kit internals or implementation details like which sensor fired.
- **Backend** (`packages/backend/test/todos.route.test.js` — extend the existing file, same `vi.mock`-the-`Todo`-model + `createApp()` + `supertest` pattern already used for the existing `linkedTodoIds` persistence tests):
  - `PATCH /api/todos/:id` persists a reordered `linkedTodoIds` array exactly as given (same assertion style already used for the existing "persists a provided linkedTodoIds array" test) — reordering is not a distinct backend concern from any other `linkedTodoIds` write, so this may be covered by the existing test(s) rather than needing a new one; confirm coverage and add only if the reordered-vs-original-array distinction isn't already exercised.
  - No-cascade invariant tests (toggle, delete) need no changes — reordering doesn't introduce any new cross-document write.
- **Frontend** (`packages/frontend/src/components/TodoDetail.test.jsx` — extend the existing `describe('linking other todos', ...)` block or a sibling `describe('reordering linked todos', ...)`):
  - The linked list renders in `linkedTodoIds` array order, not the app's full-todos-list order (regression coverage for the render-derivation change).
  - Reordering (simulate via firing the underlying drag events dnd-kit exposes, or by driving its keyboard-sensor interaction — whichever produces the more reliable, less implementation-coupled test) results in the reorder-save callback being called with the new full id array in the new order.
  - Reordering does not change `selectedLinkedId` — if a linked todo is selected before a drag, its notes remain shown/selected after the drop, even if its position moved.
  - Reordering does not call `onSave` (parent fields) or `onSaveLinkedTodo` (a linked todo's notes) — only the dedicated reorder callback fires.
  - A failed reorder save reverts the visible order back to the pre-drag order and surfaces an error, consistent with existing error-handling conventions in this component.
  - Clicking a linked todo's row (selection) and clicking its unlink "×" both continue to work unchanged now that a drag handle has been added to the row.

## Out of Scope

- Reordering anything other than linked todos within a single parent (no reordering of categories, tags, top-level todo lists, or agenda items) — this is scoped strictly to the linked-todos list inside one todo's detail view.
- Cleaning up or pruning dangling `linkedTodoIds` references as part of a reorder — a reorder must preserve them in place, not opportunistically remove them (that remains a separate, already-deferred concern from the `linked-todos` spec).
- Any change to how a linked todo is selected, unlinked, or has its notes edited/saved — those interactions are unchanged other than sharing row space with the new drag handle.
- Touch/mobile drag gestures beyond whatever dnd-kit provides by default — no bespoke mobile-specific interaction design.
- Reordering via anything other than drag (e.g. a numeric "position" input field, context-menu "move to top/bottom") — arrow-key reordering via the focused drag handle (dnd-kit's keyboard sensor) is the only non-pointer path in scope.

## Further Notes

- This directly follows the `linked-todos` feature (`.scratch/linked-todos/spec.md`), which is implemented and merged — this spec assumes that feature's current shape (two-tab `TodoDetail`, `linkedTodoIds` field, `PATCH /api/todos/:id` contract, no-cascade invariants) as a given foundation, not something to redesign.
- The user chose immediate per-drop persistence over staging reorder with the parent's Save button, and chose `@dnd-kit` (mouse + built-in keyboard support) over a no-new-dependency native-HTML5-DnD-plus-buttons approach — both confirmed directly with the user before writing this spec.
- Environment: MongoDB runs via `docker compose` (`my-planner-mongo`); `pnpm db:up` / `pnpm dev` as usual. No new environment setup beyond adding the two new frontend dependencies.
- Suggested skills for whoever picks this up: `tdd` (the render-order-derivation change and the reorder-save callback are natural test-first work), `code-review` once implemented.
