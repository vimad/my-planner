# 12 — Boards tab: browse boards, card grid, inline editing

**What to build:** The first demoable slice of the Boards view — a header tab that swaps into a board switcher and a 3-per-row card grid of the active board's items, backed by the real API from ticket 11. See `.scratch/boards/spec.md` for full context (including the winning card-design prototype, preserved on branch `prototype/boards-grid-card-variants`).

**Blocked by:** 11 — Board entity: model + full CRUD API, active-board pointer, notes search.

**Status:** ready-for-agent

- [ ] Header tab bar gains a third "Boards" option (`activeTab` in `App.tsx` gains a `'boards'` value); switching to it swaps the main content area, same mechanism the existing Notes tab uses — no router, no change to the rest of the page's chrome.
- [ ] Boards view header has a board-switcher dropdown (lists all of the profile's boards by name, creation order) and a "+ New board" affordance; picking a board sets it active via `PATCH /api/profiles/:id` (`activeBoardId`) and repopulates the grid.
- [ ] Zero-boards state: the view (and the dropdown's "+ New board" flow) prompts to name and create the first board.
- [ ] Grid renders the active board's `items` 3-per-row. Todo cards use the same compact read-only header as the collapsed Linked-Todos parent header (title, priority badge, due date chip, category chip); note cards show the note's title plus its folder path (computed client-side from the already-loaded folders array, same convention as `notesTree.ts`). Both card types show a small "Todo"/"Note" badge.
- [ ] Every card hosts an always-open inline `ExpandableNotesEditor`/`RichTextEditor` beneath the header (full toolbar, reused as-is — expand-to-fullscreen and the existing unsaved-changes indicator included, no new editor). Card content area uses a concrete `max-h-*` + `overflow-y-auto` (e.g. `max-h-28 overflow-y-auto`) — not `h-full` — to keep long content clipped/scrolling instead of blowing out the card's height.
- [ ] Editing a card's content persists via the underlying `PATCH /api/todos/:id` or `PATCH /api/notes/:id` (the card is just hosting the existing editor against the existing entity, not a new content-storage path).
- [ ] Each card has an unlink-style "×" that removes it from the board (`PATCH /api/boards/:id` with `items` minus that entry) without affecting the underlying todo/note.
- [ ] Empty states: active board has zero items (empty-grid placeholder); a card whose `itemId` no longer resolves (deleted elsewhere) renders as a ghost-card placeholder rather than erroring or vanishing.
- [ ] Switching the active profile re-scopes the Boards view to the newly active profile's boards.
- [ ] Frontend tests (RTL + Vitest, mocking `fetch`, mirroring existing component tests) cover: tab toggle swaps the content area, board switcher lists boards and switching one updates the grid, creating the first board via the zero-boards prompt, todo/note cards render with correct header content and badge, inline editor saves, remove-from-board "×" removes only the board reference, and the dangling-reference ghost-card placeholder.
