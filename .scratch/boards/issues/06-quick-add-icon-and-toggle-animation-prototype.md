Type: prototype
Status: resolved

## Question

Build a throwaway UI prototype (via `/prototype`) of the quick-add affordance that lives outside the Boards view — on todo rows and note rows — and the toggle badge it feeds into, tested in-browser against the real running app and real data.

Cover:

- The quick-add icon's resting state on a todo row and on a note row.
- Its "already on the active board" state — since multi-board membership is allowed (per [Add-to-board & active-board mechanics](02-add-to-board-and-active-board-mechanics.md)), does the icon reflect membership on the *active* board specifically (pinned/filled) even though the item might also be on other, non-active boards?
- The click animation: the icon's fly-to-toggle motion and the toggle badge's count increment.
- The toggle badge's placement and visual treatment next to the new Boards tab in the header tab bar (per [Boards view UI shape](03-boards-view-ui-shape.md)).
- Where exactly these icons appear: the main todo list/agenda, `CompletedTodos`, todo search results, and the Notes folder tree — confirm the icon shows consistently everywhere a todo/note row is rendered, or note any place it's deliberately omitted.

## Answer

Three variants were prototyped and validated live (chrome-devtools MCP, real running app, `Test` profile, mock in-memory "active board" membership — no Board backend exists yet, see [Board data model, lifecycle & API surface](07-board-data-model-lifecycle-api.md)):

- **A — Pin + arc + corner badge**: outline pin (📍) at rest, filled pin (📌) when on the active board; click sends an arcing ghost (easeOutCubic, ~420ms) to a small circular count-chip overlapping the top-right corner of the "Boards" tab. **Winner.**
- **B — Plus/check + straight fly + inline count**: outline "+" circle at rest, gradient-filled "✓" when active; straight-line ghost (linear, ~320ms, snappiest); count shown inline in the tab label itself ("Boards (3)"), flashing cyan on arrival.
- **C — Ribbon + flourish + badge dot**: outline tag at rest, filled amber ribbon (🔖) when active; highest/slowest arc (~520ms, most "playful"); small dot badge below the tab label with a rotate+scale flourish on arrival.

**Chosen: Variant A** (pin icon, arcing fly, corner-chip badge).

Findings, validated together with the icon/animation/badge design:

1. **Resting vs. active state works as a plain per-item boolean against the active board.** Toggling the icon on one item doesn't affect any other item's icon, and toggling the *note's* icon while on the Notes tab correctly updates the *Boards tab badge* seen elsewhere in the header chrome — confirming the badge always reflects the active board regardless of which view is currently open. Since this ticket's mock only ever tracks one "active board" set (matching [Add-to-board & active-board mechanics](02-add-to-board-and-active-board-mechanics.md) — there's exactly one active board concept, not one per item type), the "reflects the *active* board specifically, even though the item might be on other non-active boards too" requirement reduces to: the icon's active/inactive rendering is driven by membership in that single mock set, nothing else. A real implementation will need the equivalent per-item "is this id in the active board's item list" check against real board data instead of the mock `Set`, but no additional state-shape question was surfaced by this prototype beyond that.
2. **Click animation and badge increment work end-to-end**: clicking an inactive icon flips it to active, fires a ghost element from the icon's screen position to the Boards tab's badge position, and the badge count increments with a brief pop/bump on arrival. Clicking an active icon toggles it back off instantly (no reverse-fly animation — reasonable, since "remove" isn't the moment being celebrated) and the badge count decrements without a bump.
3. **Icon appears consistently everywhere required**: the main agenda, `CompletedTodos`, and todo search results all render it because they all go through the same shared `TodoItem` — one insertion point covers all three. The Notes folder tree renders it via a second insertion point in `NotesView`'s note row. No location was found where the icon needed to be deliberately omitted.
4. **Real bug found and fixed**: the note-row icon was initially placed *between* the note-name button and the hover-reveal Move/Delete action group (`ROW_ACTIONS_CONTAINER_CLASSES`, `hidden group-hover:flex`). Hovering the row makes Move/Delete pop into the flex layout, which shrinks the flex-1 note-name button and shifts every sibling after it — including the quick-add icon — sideways. A click aimed at the icon's pre-hover position can land on the now-shifted Delete button instead (reproduced live: a "Delete note?" confirm dialog popped up from a click on what had been the quick-add icon). **Fix: place the quick-add icon *before* the flex-1 note-name button** (leading position, fixed offset from the row's left edge) so nothing before it ever changes width, and its position never shifts regardless of what the hover-reveal group does. This is a generally-applicable rule, not just a Boards concern: never place a fixed-purpose icon immediately after a flex-1 element that has hover-conditional siblings — put it before the flex-1 item, or somewhere else whose position doesn't depend on sibling visibility.

Primary source (all three variants, the fly-animation/badge/context plumbing, and the App.tsx/TodoItem.tsx/NotesView.tsx dev-only wiring) captured to branch `prototype/boards-quick-add-icon-variants` before removing the prototype code from `main`.
