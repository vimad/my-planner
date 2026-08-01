# Boards — persistent collections of existing todos and notes

Status: ready-for-agent

Source: synthesized from the "Boards wayfinder map" (`.scratch/boards/map.md` — ten resolved tickets: [scope & relationship to existing features](issues/01-scope-relation-to-existing-features.md), [add-to-board & active-board mechanics](issues/02-add-to-board-and-active-board-mechanics.md), [Boards view UI shape](issues/03-boards-view-ui-shape.md), [notes search scope decision](issues/04-notes-search-scope-decision.md), [board grid & card design prototype](issues/05-board-grid-and-card-design-prototype.md), [quick-add icon & toggle-animation prototype](issues/06-quick-add-icon-and-toggle-animation-prototype.md), [board data model, lifecycle UX, and API surface](issues/07-board-data-model-lifecycle-api.md), [notes search endpoint design](issues/08-notes-search-endpoint-design.md), [bulk actions scope](issues/09-bulk-actions-scope.md), [board and item caps](issues/10-board-and-item-caps.md)), plus a couple of small defaults filled in while compiling this document (Board route profileId-scoping shape, and how the Boards "search to add" bar sources todo results) that followed directly from decisions already made rather than needing their own session.

## Problem Statement

Todos and Notes each live in their own place, organized by their own rules (category, folder). Neither lets you assemble an arbitrary, cross-cutting working set — "everything for the Kitchen Remodel," "everything for today's 1:1" — that mixes todos and notes together and persists independently of where those items normally live. Boards is a new, third top-level view: a named, persistent collection of *existing* todos and notes, browsable as a small card grid, built by attaching items from wherever they normally appear (a quick-add icon on every row) or by searching from within the Boards view itself.

Boards is a wholly separate concept from the existing per-todo **Linked Todos** feature — not a generalization or replacement. Linked Todos stays exactly as it is today (todo-to-todo only, scoped to one parent todo's own detail view); the two coexist and don't interact. Boards is strictly **link-only**: it never creates a new todo or note, only attaches items created elsewhere. No lifecycle is assumed — durable boards (returned to over weeks) and short-lived ones (used once, abandoned) are equally valid; nothing archives or ages boards out.

## Data Model

**`packages/backend/src/models/Board.ts`** — new entity, following the existing `Category`/`Note`/`ScratchNote` pattern (plain schema, `{ timestamps: true }`, direct `profileId` field):

```ts
export type BoardItemType = 'Todo' | 'Note'

export interface BoardItem {
  itemType: BoardItemType
  itemId: Types.ObjectId // refPath: 'items.itemType' — itemType doubles as the literal model name
}

export interface BoardDoc {
  name: string
  profileId: Types.ObjectId // ref Profile, required
  // Flat, ordered, no-cascade reference list — array position is display
  // order, no separate order field. Mirrors Todo.linkedTodoIds: deleting or
  // completing a todo, or deleting a note, must never touch any board's
  // items. Deleting a board must never delete the todos/notes it
  // references — only this document (and Profile.activeBoardId, if it
  // pointed here) are touched. A dangling itemId whose todo/note has since
  // been deleted is left in place rather than cleaned up; the frontend
  // tolerates it (dangling-ref placeholder card).
  items: BoardItem[]
  createdAt: Date
  updatedAt: Date
}
```

Unlike `linkedTodoIds` (homogeneous `Todo` refs), `items` is heterogeneous (todo or note) and must support one unified drag order across both types, so it's a single array of `{itemType, itemId}` subdocuments (`{ _id: false }`, same treatment as `Todo.recurrence`/`ScratchNote`'s line schema) rather than two separate `todoIds`/`noteIds` arrays.

**`packages/backend/src/models/Profile.ts`** gains one field:

```ts
activeBoardId: Types.ObjectId | null // ref Board, default null
```

"Active board" and "the board currently shown in the Boards view" are the same single concept — exactly one per profile at a time, switched by picking a different board from the Boards-view dropdown. This lives on `Profile` (not a `Board.isActive` flag, not a new per-profile settings entity): `Settings` today is an explicit app-wide singleton (`nextOfficeDay`), a mismatch for per-profile state, while `Profile` is already the per-profile root document. A pointer is also a single source of truth — switching active board is one write, vs. a boolean flag needing "unset old, set new" (two writes or a uniqueness constraint) — and "no active board" falls out naturally as `null`.

**No cap** on boards per profile or items per board — both unbounded, no schema/UI limit, consistent with every other reference-list/entity-list in this app today (`linkedTodoIds`, categories, notes).

## API surface

**`packages/backend/src/routes/boards.ts`** — mirrors `categories.ts`/`notes.ts` (direct `profileId` field, not `todos.ts`'s derived-via-join pattern, since `Board` has its own `profileId` just like `Category`/`Note`): `profileId` required as a query param on every read/id-addressed mutation, checked against the document's own `profileId` (404 on mismatch, not 403, so a cross-profile id reveals nothing).

- `POST /api/boards` — body `{ name, profileId }`. Creates an empty board.
- `GET /api/boards?profileId=` — lists a profile's boards, items embedded, sorted `{ createdAt: 1 }` (creation order — same convention as categories/profiles; no manual reordering of boards themselves). No separate `GET /:id` — mirrors `todos.ts`, which has none either; the frontend works off the list.
- `PATCH /api/boards/:id?profileId=` — body `{ name?, items? }`. One endpoint for rename and/or a whole-array `items` replace, covering add/remove/reorder in a single pattern — exactly like `linkedTodoIds`: the frontend computes the new full array client-side (append, remove, or reorder) and PATCHes it whole. No dedicated add-item/remove-item/reorder endpoints.
- `DELETE /api/boards/:id?profileId=` — deletes the board itself only. No cascade: the todos/notes it referenced are untouched. If the deleted board was the profile's active board, the route also updates `Profile.activeBoardId` — see Lifecycle UX below.

**`packages/backend/src/routes/profiles.ts`** — `PATCH /api/profiles/:id` gains `activeBoardId` as an updatable field (client sends it when the user picks a different board from the switcher dropdown). No new boards-specific endpoint for this.

**`packages/backend/src/routes/notes.ts`** gains a new route, to power the Boards "search to add" bar only (the main app's existing todo-only search box, `GET /api/todos/search`, is untouched and unaffected):

- `GET /api/notes/search?profileId=...&q=...&excludeIds=...` — registered before the `/:id` routes (same reason `/tags`/`/search` are registered first in `todos.ts`).
  - Matches `name` only (not folder path, not body content) — case-insensitive substring, `{ name: { $regex: q, $options: 'i' } }`, mirroring `todos/search` exactly; empty/missing `q` returns the profile's notes unfiltered.
  - `excludeIds` (comma-separated note ids) filtered via `_id: { $nin: excludeIds } }` **before** capping, so a full page of results comes back whenever that many matches exist.
  - Capped to 6 results server-side via `.limit(6)`, sorted `{ createdAt: -1 }`.
  - The client computes `excludeIds` from the active board's current note-item ids; the server never resolves the active board itself — keeps `notes.ts` decoupled from `Board`/`Profile` (it already only imports `NoteFolder`, for validation).

**Todo half of the Boards search bar** (filled in while compiling — follows directly from Linked Todos' existing pattern rather than needing its own ticket): no backend change to `todos.ts` at all. The app already keeps a full `todosList` loaded for the agenda view, and Linked Todos' own link-search already filters that in-memory list client-side (self excluded, already-linked excluded, title substring match, `.slice(0, 6)`) rather than calling a search endpoint. The Boards search bar's todo half reuses that exact approach: filter the already-loaded `todosList` client-side (title match, already-on-active-board excluded, capped to 6), so only the note half needs a real network round-trip.

## UI/UX

**Entry point.** Boards becomes a **third tab** in the existing header tab bar (Todos / Notes / Boards) — `activeTab` in `App.tsx` gains a `'boards'` value. No router; this is a third state value swapping the main content area, same mechanism the Notes tab already uses. A **toggle badge** (the active board's item count) sits on/near the Boards tab as a shortcut — clicking either the tab or the badge opens the Boards view showing the active board.

**Quick-add icon** (on every todo row and every note row, wherever rendered): a pin icon — outline (📍) at rest, filled (📌) when the item is already on the **active** board specifically (an item can belong to multiple boards; only active-board membership is reflected here). Clicking it fires an arcing fly animation (easeOutCubic, ~420ms) from the icon to a small circular count-chip on the Boards tab, incrementing the badge with a brief pop; the item is added directly to the active board, no picker. Clicking an already-filled icon removes the item from the active board instantly, no reverse animation, badge decrements without the pop. If there are **zero boards yet**, clicking the icon instead prompts the user to name and create the first board before the item is added — no silent auto-created board.

Icon placement: the main agenda, `CompletedTodos`, and todo search results all share one insertion point via `TodoItem`; the Notes folder tree has a second insertion point in `NotesView`'s note row. **Placement rule**: the icon must sit *before* any flex-1 element that has hover-reveal siblings (e.g. Notes row's Move/Delete actions) — placing it *after* such an element lets hover-triggered reflow shift the icon out from under a click (reproduced live during the prototype: a click on the icon's pre-hover position landed on Delete instead once Move/Delete popped into the layout). This is a general rule, not just a Boards concern.

**Boards view layout — 3-per-row card grid:**
- **Board switcher**: a dropdown in the Boards view header lists all boards by name, creation order, no manual reordering; picking one sets it active and repopulates the grid. A "+ New board" affordance sits alongside it, including the create-first-board prompt from the zero-boards case above.
- **Board rename**: no confirm dialog (same treatment as category/profile rename — low-stakes, reversible). Inline rename affordance (pencil/edit icon) in the header, near the switcher.
- **Board delete**: gated behind `ConfirmDialog`, with copy that inverts the app's usual cascade-delete pattern (profile/note-folder dialogs list what *will* be destroyed) since deleting a board destroys nothing downstream:
  > `Delete "<board name>"? Its N item(s) will not be deleted — only this board and its references to them.`
  (single combined item count across todos+notes). If the deleted board was active and other boards remain, the **first remaining board in creation order** becomes active; if none remain, `Profile.activeBoardId` → `null` (the same "no active board" state a fresh profile starts in).
- **Cards**: todo-card header is the same compact, read-only summary already used for the collapsed Linked-Todos parent header (title, priority badge, due date chip, category chip); note-card header is the note's title plus its folder path (client-computed from the flat folders array, same "client assembles hierarchy" convention `notesTree.ts` already follows — no server-side path builder). Both card types show a small "Todo"/"Note" badge.
- **Card body — inline editor, always open** (Variant B from the prototype, beat expand-on-click and preview-on-demand): every card shows its `ExpandableNotesEditor`/`RichTextEditor` beneath the header with no click needed, **full rich-text toolbar** included (not a stripped-down variant) — reused exactly as it exists elsewhere, including its expand-to-fullscreen affordance and its existing unsaved-changes indicator (light accent border + conditional Save button while live content differs from `savedContent`). No new "diff" or track-changes UI — this is reuse, not a new concept.
  - **Implementation gotcha, worth remembering beyond Boards**: the card's editor `contentClassName` must use a concrete `max-h-*` + `overflow-y-auto` (e.g. `max-h-28 overflow-y-auto`, same pattern `TodoDetail`'s parent-notes panel already uses via `max-h-[40vh]`) — **not** `h-full`. `ExpandableNotesEditor` only gives its root div a height-bearing className while enlarged; inline, that root is an unstyled auto-height block, so `h-full` resolves against an indefinite parent and silently falls back to content-based sizing (no clipping, no scrollbar) — confirmed live: a 5-paragraph paste blew one card to ~5x its neighbors' height.
- **Card ordering**: manually drag-to-reordered within the grid (dnd-kit, same pattern as the existing Linked Todos reorder — visible drag handle, drop-position preview, keyboard arrow-key support), persisted immediately via `PATCH /api/boards/:id` with the whole reordered `items` array, no separate save step.
- **Removing an item from a board**: an unlink-style "×" on the card (consistent with Linked Todos), PATCHes the whole `items` array minus that entry — never affects the underlying todo/note itself.

**Search-and-add** (from within the Boards view): a search bar queries todos (client-side filter over the already-loaded `todosList`, mirroring Linked Todos' own link-search) and notes (`GET /api/notes/search`) together, each excluding items already on the active board and capped to 6 results, mirroring Linked Todos' search-excludes-already-linked behavior.

**Empty states** (no-cascade "tolerate and placeholder" convention, same as Linked Todos, not an error):
- No boards exist yet: prompt to create the first one (same prompt as the quick-add zero-boards case).
- Active board has zero items: empty-grid placeholder.
- A card whose underlying todo/note reference is dangling (deleted elsewhere): a ghost-card placeholder rather than erroring or silently vanishing.

## Out of scope

(Carried from the map, unchanged.) Generalizing/replacing Linked Todos with Boards. Creating brand-new todos/notes from within the Boards view. An actual text diff/track-changes view of note edits (reuses the existing unsaved-changes indicator instead). Bulk actions on a board — multi-select add, or moving/copying an item between boards in one step; v1 stays strictly one-item-at-a-time.

## Primary sources

- Board grid & card design prototype (three compared variants — expand-on-click, always-open dense editor, preview-on-demand): branch `prototype/boards-grid-card-variants`.
- Quick-add icon & toggle-animation prototype (three compared variants — pin/arc/corner-badge, plus/check/inline-count, ribbon/flourish/badge-dot): branch `prototype/boards-quick-add-icon-variants`.
