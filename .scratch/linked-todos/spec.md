# Spec: Linked Todos

**Status:** ready-for-agent

## Problem Statement

When preparing for something like a meeting, the user often has several existing, unrelated todos that are all relevant to that one moment — e.g. "Get filled EPF form", "Chase approval from finance", "Print handout" all matter for "Today's 1:1 with manager". Right now those todos just sit in whatever category they were created in, with no way to see them together or jump to their notes without leaving the todo the user actually opened. The user has to remember which other todos matter and hunt for them individually.

## Solution

A todo can have other existing todos attached to it as **linked todos** — a flat, reference-only grouping for visibility and quick access to notes, with no ownership or cascading behavior implied. From any todo's detail view, the user can search for and link other existing todos, see the linked list, and open any linked todo's notes to read or edit them right there, without closing the parent todo or navigating away.

This was explored via a UI prototype (`/prototype`) with three structurally different variants (a drawer, a split workspace, and a drill-down), tested in-browser against the real running app and real data. The user picked **the split workspace variant**: an expanded, two-column "Todos" tab (linked-list on the left, selected linked todo's notes on the right) alongside the existing single-column "Notes" tab that holds the parent's own editable fields.

## User Stories

1. As a user reviewing a todo, I want to search for and link any other existing todo to it, so that I can group everything relevant to one task/moment in one place.
2. As a user, I want to see the list of todos already linked to the one I'm viewing, so that I know at a glance what else is relevant.
3. As a user, I want to select a linked todo from that list and read or edit its notes without closing the todo I currently have open, so that I don't lose my place jumping back and forth.
4. As a user editing a linked todo's notes, I want a dedicated small Save button right there in that panel, so that I can persist just that change without having to also save/re-submit the parent todo's own fields.
5. As a user, I want to unlink a todo I linked by mistake (or that's no longer relevant), so that the linked list stays accurate.
6. As a user, I want the parent todo's own editable fields (title, priority, due date, category, tags, recurrence, office-day link) to behave exactly as they do today when I'm on the Notes tab, so that linking todos doesn't change or complicate the core todo-editing experience.
7. As a user, I want the parent todo's header to collapse to a compact, read-only summary (title, priority badge, due date, category chip) while I'm on the Todos tab, so that the widened linking workspace doesn't feel cluttered with a full edit form I'm not using in that moment.
8. As a user, I want switching back to the Notes tab to restore the full editable form exactly as I'd left it, so that in-progress edits to the parent todo's own fields are never lost by visiting the Todos tab.
9. As a user, I want the Todos tab's label to show the current linked-todo count (e.g. "Todos (3)"), so that I can tell at a glance whether anything is linked without opening the tab.
10. As a user, I want completing, reopening, or deleting the parent todo to leave every linked todo completely untouched, so that grouping todos for visibility never accidentally destroys or completes unrelated work.
11. As a user, I want completing, reopening, or deleting a linked todo (from anywhere in the app, not just this view) to leave the parent todo and the link itself untouched other than removing that one reference, so that the relationship never cascades in either direction.
12. As a developer maintaining this feature later, I want the no-cascade invariant documented directly on the schema field and near the unlink/link logic, so that a future change doesn't accidentally "fix" this into a cascading relationship.
13. As a user, I want the links I create to survive a page reload, so that this is a real, persisted feature and not a session-only convenience.
14. As a user searching to link a todo, I want the search to exclude the parent todo itself and todos already linked, so that I'm not offered irrelevant or duplicate results.
15. As a user, I want the linking feature to work the same for any todo regardless of its category, priority, or completion state, so that there are no hidden restrictions on what can be linked to what.
16. As a developer, I want the backend PATCH endpoint for updating a linked todo's own notes to reuse the same general-purpose update path as any other todo field update, so that there isn't a second, parallel way to persist a todo's body.

## Implementation Decisions

- **Data model**: the `Todo` model gains a `linkedTodoIds` field — an array of ObjectId references to other `Todo` documents, defaulting to an empty array. This is a flat, symmetric-in-implementation-but-directional-in-storage reference list stored only on the todo that initiated the link (the "parent"); there is no back-reference maintained on the linked todo itself. A one-line comment on this schema field must state the no-cascade invariant explicitly: linking is a reference only, and completing/reopening/deleting either side must never affect the other.
- **API contract**: `PATCH /api/todos/:id` (the existing general-update route) is extended to accept and persist `linkedTodoIds` following the exact same pattern already used for every other optional field on that route (`if (linkedTodoIds !== undefined) update.linkedTodoIds = linkedTodoIds`). No new route is added for the link/unlink action itself — the frontend reads the parent todo's current `linkedTodoIds`, computes the new array (append or remove one id), and PATCHes the whole array back, same as it already does for `tags`.
- **No-cascade invariant enforcement**: deleting a todo (`DELETE /api/todos/:id`) and completing/reopening a todo (`PATCH /api/todos/:id/toggle`) must not be modified to touch any other todo's `linkedTodoIds`. This is a deliberate decision to leave dangling references when a linked todo is deleted, rather than proactively cleaning up every parent that references it — the frontend is responsible for tolerating a `linkedTodoIds` entry that no longer resolves to a real todo (simply omit it from the rendered linked list; do not error).
- **Frontend — folding the winning prototype variant into `TodoDetail`**: the real `TodoDetail` component gains the split-workspace shape validated in the prototype:
  - Two tabs: **Notes** (the existing single-column editable form: title, priority, due date, category, tags, recurrence, office-day link, and the parent's own rich-text body) and **Todos** (`Todos (N)` when N linked todos exist).
  - On the **Todos** tab, the full editable header collapses to a compact read-only summary — title, priority badge, due date chip, category chip — and the popup itself widens to accommodate a two-column layout: a left column with a search-to-link input (excluding the parent and already-linked todos, matching-on-title, capped to a handful of results) plus the linked list (each entry click-to-select, with its own unlink "×" control); a right column showing the currently selected linked todo's title and its rich-text notes, editable in place.
  - The selected linked todo's notes panel has its own small **Save** button that persists only that todo's `body` via a PATCH to `/api/todos/:id` for that todo's id — independent of the parent todo's own Save/Cancel footer, and without closing or affecting whatever popup is currently open for the parent.
  - Switching tabs must not lose in-flight edits: whatever rich-text editor is currently mounted (parent's Notes editor, or a linked todo's notes editor) has its live document captured before the tab switch or before selecting a different linked todo, so returning to it shows the latest unsaved edits.
  - This fully replaces the parent's own `handleUpdateTodo`-style full-form save with respect to the linked todo's notes — the parent's Save button continues to only save the parent's own fields (including its own `linkedTodoIds`, if link/unlink happened during this session), never a linked todo's body.
- **Frontend save plumbing**: reuse the existing pattern already added ad hoc during prototyping (a function that PATCHes an arbitrary todo id's fields without clearing whichever popup is currently open) as the real, permanent way any linked todo's notes get saved from within another todo's detail view — this is distinct from the existing `handleUpdateTodo`, which always closes the popup on success and is reserved for saving the currently-open todo itself.
- **Prototype retirement**: once the above is real and working, capture the full three-variant exploration to a throwaway git branch (not `main`) before deleting the prototype folder, per the `prototype` skill's own step 6 — leave a pointer to that branch and a one-line note of which variant won and why, in the commit message that removes the prototype code. Remove the `import.meta.env.PROD` branch in `App.jsx` so the real `TodoDetail` is the only thing that ever renders.

## Testing Decisions

- Good tests here assert observable behavior (API responses, rendered DOM/user-facing state) — not implementation details like internal state variable names or which ref holds which editor instance.
- **Backend** (`packages/backend/test/todos.route.test.js` — extend the existing file, following its established pattern of `vi.mock`-ing the `Todo` model and driving requests through `createApp()` + `supertest`):
  - `PATCH /api/todos/:id` persists a provided `linkedTodoIds` array, following the same `if (field !== undefined) update.field = ...` assertion style already used for `tags`/`recurrence` in that file.
  - `PATCH /api/todos/:id/toggle` (complete/reopen) does not touch `linkedTodoIds` on any other todo — the no-cascade invariant, asserted by confirming the toggle route only ever calls `findById`/`save` on the target todo's own id, never touching any other todo.
  - `DELETE /api/todos/:id` succeeds and does not attempt to look up or modify any other todo's `linkedTodoIds` — same no-cascade invariant, on the delete path.
- **Frontend** (`packages/frontend/src/components/TodoDetail.test.jsx` — extend the existing file, following its established React Testing Library conventions):
  - Switching to the Todos tab shows the collapsed read-only header (title/priority/due date/category) instead of the editable form fields.
  - Searching in the link input surfaces matching todos excluding the parent and already-linked todos; clicking a result adds it to the linked list.
  - Clicking the unlink "×" on a linked todo removes it from the linked list.
  - Selecting a linked todo shows its notes; using that panel's own Save button calls the save-linked-notes callback with that linked todo's id and body, independent of the parent's own Save button.
  - Switching from the Todos tab back to Notes preserves whatever the user had typed into the parent's own editable fields before switching.

## Out of Scope

- The reported bullet-list/numbered-list toolbar regression in `RichTextEditor.jsx` — unrelated to this feature, not yet reproduced or root-caused. Track and fix separately via the `diagnosing-bugs` skill/its own ticket.
- Any cascade behavior between parent and linked todos (completion, deletion, category changes, etc.) — explicitly and permanently out of scope; see the no-cascade invariant above.
- Cleaning up dangling `linkedTodoIds` references when the referenced todo is deleted (e.g. a scheduled sweep or cascade-on-delete) — deferred; the frontend simply tolerates and hides unresolvable references for now.
- Multi-level or bidirectional link visibility (e.g. showing "linked from" on the child todo, or letting a linked todo see who links to it) — not requested; the relationship is one-directional in storage and UI (parent → children only).
- A dedicated link/unlink REST endpoint — the existing general-purpose `PATCH /api/todos/:id` is reused instead (see Implementation Decisions).
- The two losing prototype variants (drawer, drill-down) — retired to a throwaway branch, not carried into the real implementation.

## Further Notes

- This was built and validated as a live prototype first (chrome-devtools MCP against the real running app and real data), not designed on paper — the Implementation Decisions above describe the validated shape, not a fresh proposal.
- Environment: MongoDB runs via `docker compose` (`my-planner-mongo`); `pnpm db:up` / `pnpm dev` as usual. No new environment setup is needed for this feature.
- Suggested skills for whoever picks this up: `tdd` (backend field/route change and the no-cascade invariant are natural test-first work), `code-review` once implemented, and separately (out of scope here) `diagnosing-bugs` for the toolbar regression.

## Comments

**2026-07-28** — Implemented. The prototype's 3 variants (drawer, split workspace, drill-down) were captured to branch `prototype/linked-todos-exploration` (commit `ca9b28b`) before deleting `packages/frontend/src/prototype-views/linked-todos/` from `main`. Variant B (split workspace) won and was folded into `TodoDetail.jsx` as described above. `linkedTodoIds` added to the `Todo` model and `PATCH /api/todos/:id`; backend no-cascade behavior and frontend linking/unlinking/notes-save behavior are covered by tests in `todos.route.test.js` and `TodoDetail.test.jsx`.
