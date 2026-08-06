# Spec: Note Linked Todos

**Status:** ready-for-agent

## Problem Statement

When capturing notes (meeting notes, journal entries, reference material), the user often wants to connect actionable work to that note — either turning something written in the note into a new todo, or attaching existing todos that are relevant to what the note is about. Today Notes and Todos are completely separate: there's no way to create a todo from a note, no way to see which todos relate to a note, and no way to jump from a note to a related todo's full detail. The user has to remember the connection themselves and hunt for the right todo manually.

## Solution

A note can have other existing todos attached to it as **linked todos** — a flat, reference-only grouping for visibility, mirroring the existing todo-to-todo `linked-todos` feature (`.scratch/linked-todos/spec.md`) but on the Note side of the app. From a note's editor pane, the user can search for and link any existing todo, or quickly create a brand-new todo from the note (which is then automatically linked). The linked-todos surface stays out of the way until asked for: a small pill trigger with a live count badge sits above the note editor; clicking it expands an inline rail beside the editor showing the linked list — not an overlay, so the note stays visible and the page layout simply gains a column. The rail's own "+" opens a small panel for search/create. Clicking any linked todo opens the app's normal, full `TodoDetail` popup, so the user can view or edit it exactly as they would from anywhere else in the app.

This was explored via a UI prototype (`/prototype`) with three structurally different variants — an accordion section under the editor, a persistent rail beside the editor, and an inline chip tray — tested live in-browser against the Test profile with real (read-only) search data. The user picked the rail variant, then iterated on its interaction model live: rejected an always-visible rail (too much permanent screen real estate) and rejected a full-screen overlay reveal (blocked the editor behind a backdrop); landed on a hidden-by-default trigger that expands the rail *inline*, next to the editor, with no backdrop.

## User Stories

1. As a user editing a note, I want a small "Linked todos" trigger above the editor that's collapsed by default, so that the note editor keeps its full width until I actually need to work with linked todos.
2. As a user, I want the trigger to show a count badge once the note has linked todos, so that I know at a glance whether anything is linked without expanding it.
3. As a user, I want clicking the trigger to expand a linked-todos rail inline, next to the note editor (not as an overlay/backdrop covering the page), so that I can see the note and the linked todos at the same time.
4. As a user, I want clicking the trigger again to collapse the rail, so that I can get the full-width editor back whenever I'm done.
5. As a user, I want the expand/collapse state to be a purely local UI preference, not persisted, so that every note opens with the rail collapsed by default and stays uncluttered.
6. As a user, I want a "+" button on the rail that opens a small panel to search for or create a todo, so that adding a link doesn't require leaving the note.
7. As a user, I want to search existing todos by title from that panel and see matching results, excluding todos already linked to this note, so that I can quickly find the right one without duplicate offers.
8. As a user, I want clicking a search result to link it to the current note immediately, so that linking is a single click, not a multi-step form.
9. As a user, I want a "Create new" option in that same panel where I type a title and create a brand-new todo, so that I can turn a thought from my note directly into a todo without switching to the Todos tab.
10. As a user, I want a todo created this way to be linked to the note it was created from immediately, so that I don't have to search for it and link it as a separate second step.
11. As a user, I want each linked todo in the rail to show enough at-a-glance info (title, priority, category) so that I can tell what it's about without opening it.
12. As a user, I want clicking a linked todo in the rail to open it in the same full `TodoDetail` popup used everywhere else in the app, so that I can view or edit it (title, priority, due date, tags, notes, its own linked todos, etc.) with the real, full editing experience — not a stripped-down preview.
13. As a user, I want to unlink a todo from the note (without deleting the todo itself) via a control on its row in the rail, so that I can keep the linked list accurate as things change.
14. As a user, I want linking, unlinking, and creating-and-linking to persist immediately, so that I never lose the connection by navigating away from the note without clicking a separate "save" button.
15. As a user, I want the linked-todos list to survive a page reload or switching notes and back, so that this is a real, persisted feature, not a session-only convenience.
16. As a user, I want the relationship to be one-directional and non-cascading: completing, editing, or deleting a linked todo never affects the note, and deleting the note never affects (or deletes) any linked todo, so that linking is purely for grouping and visibility, never ownership.
17. As a user, I want a linked todo that's since been deleted to simply disappear from the note's linked list rather than showing a broken entry or erroring, so that a stale reference never breaks the note view.
18. As a user, I want this to work the same for any note regardless of which folder it's in, so that there are no hidden restrictions on which notes can have linked todos.
19. As a user switching between notes in the tree, I want each note's own rail (its open/closed state and its contents) to reflect that specific note, so that one note's linked todos never bleed into another's.
20. As a user, I want the rail's linked-todo cards to use the same priority-badge and category-chip styling used everywhere else in the app, so that linked todos look and feel consistent with the rest of the UI.
21. As a developer, I want note-to-todo linking to reuse the same "just persist the array" contract the todo-to-todo `linked-todos` feature already established on `PATCH /api/todos/:id`, applied to `Note` via `PATCH /api/notes/:id`, so that the two features stay consistent in shape.
22. As a developer, I want the "create new todo from a note" quick-create to reuse the existing plain `POST /api/todos` endpoint, so that a note-originated todo is created exactly the same way as any other todo, with no special-cased creation path.
23. As a developer, I want the todo search used in the link panel to reuse the existing `GET /api/todos/search` endpoint already used elsewhere in the app, so that there isn't a second, parallel search implementation.
24. As a user, I want opening a linked todo's `TodoDetail` popup from a note to behave identically to opening it from the Todos tab, agenda, or Boards (same save/close/its-own-linked-todos/notes behavior), so that there's no special-cased, partial version of the todo editor just for this entry point.
25. As a user, I want the search results in the link panel to be capped to a small, useful number rather than an unbounded list, consistent with how the equivalent todo-to-todo search already behaves.
26. As a developer maintaining this feature later, I want the no-cascade invariant documented directly on the new schema field, so that a future change doesn't accidentally "fix" this into a cascading relationship.

## Implementation Decisions

- **Data model**: `Note` gains a `linkedTodoIds` field — an array of ObjectId references to `Todo` documents, defaulting to an empty array. Same shape and same storage direction as `Todo.linkedTodoIds` (stored only on the note; no back-reference maintained on the linked `Todo`). A one-line comment on the field must state the no-cascade invariant explicitly, mirroring the existing comment on `Todo.linkedTodoIds`.
- **API contract — no new routes**: `PATCH /api/notes/:id` (the existing general-update route) is extended to accept and persist `linkedTodoIds`, following the exact pattern already used on `PATCH /api/todos/:id` (`if (linkedTodoIds !== undefined) update.linkedTodoIds = linkedTodoIds`). Searching reuses the existing `GET /api/todos/search?profileId=&q=` verbatim. Creating a todo from a note reuses the existing plain `POST /api/todos` verbatim — the frontend then immediately appends the new todo's id to the note's `linkedTodoIds` and PATCHes it.
- **No-cascade invariant enforcement**: `DELETE /api/todos/:id`, `PATCH /api/todos/:id/toggle`, and `DELETE /api/notes/:id` are all left untouched by this feature — none of them gain any cross-document write. Deleting a linked todo leaves a dangling id in the note's `linkedTodoIds`; the frontend is responsible for tolerating this (omit any id that doesn't resolve to a loaded todo from the rendered rail, rather than erroring), same convention as the todo-to-todo feature.
- **Persistence model — immediate, not staged**: every link, unlink, and create-and-link action PATCHes the note's `linkedTodoIds` right away (optimistic local update; on failure, revert to the last known-good array and surface the error using this app's existing error-surfacing convention). This is independent of `NoteEditorPane`'s separate dirty-tracked Name/Body save flow — the rail is never gated behind that Save button. This follows the same reasoning the `reorder-linked-todos` feature used to choose immediate persistence over staging: a link is a direct, one-step action, and staging it behind an unrelated save button risks silently losing it.
- **NotesView owns its own linking data, matching its existing architecture**: `NotesView` already deliberately fetches its own `folders`/`notes` independently of `App.tsx`'s state (see its existing module doc comment). This feature keeps that shape — `NotesView` fetches its own `categories` (`GET /api/categories?profileId=`, for the rail's category chips) and its own `todos` (`GET /api/todos?profileId=`, to resolve each linked id to a full `Todo` for the rail card and for opening `TodoDetail`) on the same profile-switch/refresh cadence it already uses for folders/notes. `App.tsx`'s own `todos`/`categories` state is not threaded down as props — the two fetches are intentionally independent, same as today.
- **Opening a linked todo**: `NotesView` gains a new required prop, `onOpenTodo: (todo: Todo) => void`, threaded from `App.tsx` as `onOpenTodo={setSelectedTodo}` — the exact same pattern already used for Boards (`onOpenTodo={setSelectedTodo}` at the Boards call site). Clicking a linked-todo card resolves its id against `NotesView`'s own freshly-fetched `todos` and calls this prop; `TodoDetail` itself is unmodified and renders exactly as it does from any other entry point.
- **Frontend shape (folding in the winning prototype variant)**: `NoteEditorPane` (or its successor) gains:
  - A collapsed-by-default local boolean (component state, not persisted, reset whenever a different note is selected — matches the pane's existing `key={selectedNoteId}`-driven remount-per-note pattern) controlling rail visibility.
  - A trigger pill above the editor showing a live count badge (`linked.length`) and toggling the boolean above.
  - When expanded, the note pane's content becomes editor + rail side by side (so the overall Notes layout is folder tree | note editor | rail, three columns, only while a given note's rail is open).
  - Each rail entry is a card: title, priority badge (reusing the same `PRIORITY_BADGE_STYLES` convention already duplicated between `TodoItem.tsx`/`TodoSummaryHeader.tsx`), category chip (`Category.color`, same inline-style convention used elsewhere for category color), and an unlink control.
  - The rail's "+" opens a small overlay panel (fixed right-edge) with two tabs, "Search existing" and "Create new" — this one sub-interaction is the exception to "no overlay": it's a short-lived, secondary action panel, not the main linked-todos surface, and overlaying it doesn't hide the note or the rail's existing content the way overlaying the whole rail did.
  - The following type shape, produced during prototyping, encodes the final decision on what the rail needs per linked entry (trimmed from the prototype's `LinkedTodoStub`, decision-relevant fields only — the real implementation resolves this directly from the app's already-typed `Todo`, it does not need a separate stub type):
    ```ts
    // Rail card needs, resolved from the app's real Todo type - no new type required:
    { id: string; title: string; categoryId?: string; priority?: TodoPriority; completed?: boolean }
    ```

## Testing Decisions

- Good tests here assert observable behavior (API request/response shapes, rendered DOM, callback invocations) — not implementation details like internal state variable names or which boolean holds the rail's open/closed flag.
- **Backend** (`packages/backend/test/notes.route.test.ts` — extend the existing file, following its established `vi.mock`-the-`Note`-model + `createApp()` + `supertest` pattern, mirroring the equivalent existing tests in `todos.route.test.ts` for `Todo.linkedTodoIds`):
  - `PATCH /api/notes/:id` persists a provided `linkedTodoIds` array, following the same `if (field !== undefined) update.field = ...` assertion style already used for other optional fields on that route.
  - `DELETE /api/notes/:id` does not attempt to look up or modify any `Todo` document — the no-cascade invariant, note→todo direction. (The Todo-side invariants — toggle/delete not touching other documents — are already covered by the existing `linked-todos` feature's tests in `todos.route.test.ts` and need no new coverage here.)
- **Frontend** (`packages/frontend/src/components/NotesView.test.tsx` — extend the existing file, following its established React Testing Library + `stubFetch` conventions already used there for folders/notes):
  - The "Linked todos" trigger renders collapsed (no rail visible) by default for a note that has linked todos, with the badge showing the correct count.
  - Clicking the trigger reveals the rail; clicking it again hides it.
  - Selecting a different note resets the rail to collapsed.
  - Opening the "+" panel and searching surfaces matching todos excluding ones already linked to the current note; clicking a result calls the notes PATCH with the id appended to `linkedTodoIds`.
  - Using "Create new" in that panel calls `POST /api/todos`, then calls the notes PATCH with the new todo's id appended.
  - Clicking a linked todo card calls the `onOpenTodo` prop with the resolved `Todo` object.
  - Clicking a linked todo's unlink control calls the notes PATCH with that id removed from `linkedTodoIds`.
  - A `linkedTodoIds` entry that doesn't resolve to any todo in the loaded `todos` list is silently omitted from the rendered rail (no broken row, no thrown error).

## Out of Scope

- Any cascade behavior between a note and its linked todos (completing/editing/deleting a linked todo affecting the note, or vice versa) — explicitly out of scope, matching the no-cascade invariant of the existing todo-to-todo `linked-todos` feature.
- Reordering linked todos within a note (drag-to-reorder, as the sibling `reorder-linked-todos` feature added for the Todo side) — not requested here; array order is whatever order links were added in.
- A "linked from" back-reference visible on the Todo side (e.g. showing which notes link to a given todo) — one-directional, note → todos only.
- Cleaning up or pruning dangling `linkedTodoIds` entries when a linked todo is deleted — deferred, same as the existing feature; the frontend just hides unresolvable entries.
- A dedicated link/unlink REST endpoint — reuses the general-purpose `PATCH /api/notes/:id`.
- Persisting the rail's expand/collapse UI state across reloads or note switches — always resets to collapsed per note, per user story 5.
- The two losing prototype variants (accordion section under the editor, inline chip tray) — retired to a throwaway branch, not carried into the real implementation.
- Any change to the `TodoDetail` popup itself, or to the todo-to-todo `linked-todos`/`reorder-linked-todos` features — both reused/left as-is; this feature only adds a new entry point that opens `TodoDetail`.
- A read-only "preview" popup for a linked todo — the prototype used one to avoid mutating real data during prototyping only; the real feature always opens the full, real `TodoDetail`.

## Further Notes

- This directly follows the `linked-todos` feature (`.scratch/linked-todos/spec.md`, implemented) for the field/route contract shape, and the `reorder-linked-todos` feature (`.scratch/reorder-linked-todos/spec.md`, implemented) for the immediate-persistence-over-staging precedent — both assumed as given foundations, not redesigned here.
- Built and validated as a live prototype first (chrome-devtools MCP against the real running app, Test profile, real read-only search data), iterated live with the user: three variants shown (accordion, rail, chip tray); the rail was chosen, then refined twice live — rejecting an always-visible rail and a full-overlay reveal — before landing on the hidden-trigger + inline-expand shape described above. The Implementation Decisions above describe that validated shape, not a fresh proposal.
- Prototype code lives at `packages/frontend/src/components/NoteLinkedTodos.prototype.tsx`, wired into `NotesView.tsx`/`NoteEditorPane` and switchable via `?linkVariant=A|B|C` on the Notes tab — capture it to a throwaway branch per the `prototype` skill's own retirement step before removing it from `main`.
- Environment: MongoDB runs via `docker compose` (`my-planner-mongo`); `pnpm db:up` / `pnpm dev` as usual. No new environment setup needed.
- Test seams confirmed with the user directly: extend `packages/backend/test/notes.route.test.ts` and `packages/frontend/src/components/NotesView.test.tsx` — no new test files or seams introduced.
- Suggested skills for whoever picks this up: `tdd` for the schema/route change and the immediate-persist link/unlink/create flow, `code-review` once implemented.
