Type: prototype
Status: resolved

## Question

Build a throwaway UI prototype (via `/prototype`) of the Boards view's visual and interaction design, tested in-browser against the real running app and real data, then folded into a concrete spec section once validated.

Cover:

- The 3-per-row card grid layout, at different item counts (0, 1, a full row, several rows).
- Todo-card and note-card layouts per [Boards view UI shape](03-boards-view-ui-shape.md): header content, the Todo/Note badge, and the inline `ExpandableNotesEditor` (with its existing expand affordance and unsaved-changes indicator) hosted inside a small card rather than a full popup — does the editor need a different size/density variant to fit the card, or does it work as-is?
- The board-switcher dropdown + "+ New board" flow, including the create-first-board prompt from [Add-to-board & active-board mechanics](02-add-to-board-and-active-board-mechanics.md).
- Drag-to-reorder cards within the grid.
- Removing an item from a board (an unlink-style "×", consistent with Linked Todos) without affecting the underlying todo/note.
- Empty states: no boards exist yet; the active board has zero items; a card whose underlying todo/note reference is missing (deleted elsewhere) — apply the same no-cascade "tolerate and hide/placeholder" convention already established by Linked Todos, rather than erroring.

## Answer

Three variants were prototyped and validated live (chrome-devtools MCP, real running app, `Test` profile, mock data — no Board backend exists yet, see [Board data model, lifecycle & API surface](07-board-data-model-lifecycle-api.md)):

- **A — Expand on click**: compact header-only cards, click to grow and reveal the inline editor.
- **B — Always-open dense editor**: every card always shows its editor beneath the header, no click needed. **Winner.**
- **C — Preview + edit on demand**: read-only text snippet by default, explicit click to swap in the full editor.

**Chosen: Variant B**, with two refinements added after initial review:

1. **The dense editor gets the full rich-text toolbar** (`toolbar` prop on `ExpandableNotesEditor`/`RichTextEditor` — bold/italic/underline/strikethrough/bullet/numbered-list), not a stripped-down variant. So the open question in this ticket ("does the editor need a different size/density variant") is answered: no new editor variant — same `ExpandableNotesEditor` as everywhere else, toolbar included, just sized smaller via a capped content height (below).
2. **The content area needs a concrete `max-h` + `overflow-y-auto`, not `h-full`.** Confirmed live: pasting a 5-paragraph block into a card with `contentClassName="h-full overflow-y-auto ..."` blew that one card out to ~5x its neighbors' height instead of scrolling internally. Root cause: `ExpandableNotesEditor` only gives `RichTextEditor`'s own root div a flex/height-bearing className while *enlarged*; inline, that root div is an unstyled block with auto height, so a `h-full` on its `contentClassName` child resolves against an indefinite parent and CSS just falls back to content-based sizing (no clipping, no scrollbar). Fixed by using `contentClassName="max-h-28 overflow-y-auto ..."` (a concrete value, same pattern `TodoDetail`'s own parent-notes panel already uses via `max-h-[40vh]`) instead of `h-full` — verified: long content now clips and scrolls at a fixed card height. **This is a real, generally-applicable gotcha for any future dense/small hosting of `ExpandableNotesEditor`, not just Boards** — worth keeping in mind wherever it's reused at small sizes.

Other structural pieces validated together with the winning card design, all working as designed: 3-per-row grid, board-switcher dropdown + "+ New board" + create-first-board prompt, drag-to-reorder (dnd-kit, same pattern as Linked Todos), remove-from-board "×", empty board state, and the dangling-reference ghost-card placeholder (no-cascade tolerance).

Card header note: the category chip already shows the todo's category (matching the real collapsed Linked-Todos header) — during review this was briefly mistaken for a "profile" badge purely because the mock category happened to be named "Work", coincidentally identical to a real profile's name in this app. No design change was needed there; mock data was renamed (`Ops`/`Errands`) to remove the ambiguity. There is no profile badge on the card, and none is needed — Boards is scoped per-profile already.

Primary source (all three variants + the App.tsx dev-only wiring) captured to branch `prototype/boards-grid-card-variants` before removing the prototype code from `main`.
