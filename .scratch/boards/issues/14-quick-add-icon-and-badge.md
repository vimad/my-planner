# 14 — Quick-add icon and toggle badge across the app

**What to build:** The cross-app entry point into Boards — a quick-add pin icon on every todo row and every note row, and the toggle badge on the Boards tab it feeds into. See `.scratch/boards/spec.md` for full context (including the winning icon/animation prototype, preserved on branch `prototype/boards-quick-add-icon-variants`).

**Blocked by:** 12 — Boards tab: browse boards, card grid, inline editing (needs the Boards tab to exist as the badge's anchor).

**Status:** ready-for-agent

- [ ] Pin icon on every todo row via `TodoItem` (covers the main agenda, `CompletedTodos`, and todo search results through that one shared insertion point) and on every note row via `NotesView`. Outline (📍) at rest, filled (📌) when the item is already on the *active* board.
- [ ] **Placement rule**: the icon must sit *before* any flex-1 element that has hover-reveal siblings (e.g. the Notes row's Move/Delete actions) — not after — so hover-triggered reflow never shifts it out from under a click.
- [ ] Clicking an outline icon: if zero boards exist, prompts to name and create the first board before adding; otherwise adds the item to the active board immediately (`PATCH /api/boards/:id`, appending an `{itemType, itemId}` entry), fires an arcing fly animation (~420ms) from the icon to a small count-chip badge on the Boards tab, and increments the badge count with a brief pop.
- [ ] Clicking a filled icon removes the item from the active board instantly (no reverse-fly animation), badge count decrements without the pop.
- [ ] Toggle badge on the Boards tab always reflects the active board's current item count, regardless of which tab is currently open.
- [ ] Frontend tests cover: icon renders in resting vs. active-board-membership state on both a todo row and a note row, click-to-add updates the icon state and badge count, click-to-remove reverses both, the zero-boards prompt-to-create flow, and a regression test for the hover-reveal placement bug (icon remains clickable at its fixed position when a note row's Move/Delete actions are visible on hover).
