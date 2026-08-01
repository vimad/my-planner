Type: grilling
Status: resolved

## Question

What does the Boards view itself look like, at a structural level — entry point, card contents, board switching, and card ordering?

## Answer

- **Entry point:** Boards becomes a **third tab** in the existing header tab bar (Todos / Notes / Boards), directly clickable like the other two (`activeTab` in `App.tsx` gains a `'boards'` value). The toggle badge (showing the active board's item count) sits near/on that tab as a shortcut/indicator — clicking either the tab or the badge opens the Boards view showing the active board.
- **Card contents (3-per-row grid):**
  - Todo cards: header is the same compact, read-only summary already used for the collapsed Linked-Todos parent header — title, priority badge, due date chip, category chip.
  - Note cards: header is the note's title plus its folder path.
  - Both card types show a small badge indicating "Todo" or "Note".
  - Both card types have an **inline** editor beneath the header — no separate modal/panel is needed to read or edit. This inline editor reuses `ExpandableNotesEditor`/`RichTextEditor` exactly as they exist today, including their already-built expand-to-fullscreen affordance and their already-built unsaved-changes indicator (light accent border + conditional Save button while live content differs from `savedContent`, per `notes-dirty-indicator`). No new "highlight changes" UI concept needs designing — this was explicitly confirmed as reuse, not an actual text diff (see the map's Out of scope).
- **Board switching:** a **dropdown** in the Boards view header lists all boards by name; picking one sets it active (see [Add-to-board & active-board mechanics](02-add-to-board-and-active-board-mechanics.md)) and repopulates the grid. A "+ New board" affordance sits alongside the dropdown.
- **Card ordering:** cards are **manually drag-to-reordered** within the grid, persisted immediately per board — same interaction precedent as the existing Linked Todos reorder feature (visible drag handle, drop-position preview, keyboard arrow-key support, immediate persistence with no separate save step, graceful handling of dangling/unresolvable references).
