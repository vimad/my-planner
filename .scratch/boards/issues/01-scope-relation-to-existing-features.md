Type: grilling
Status: resolved

## Question

What is this new concept, how does it relate to the existing Linked Todos feature, and what's its basic purpose, name, and scope boundary?

## Answer

- **Working name: Boards.** Used throughout the map, tickets, and (later) code/component/model names.
- **A wholly separate, new top-level concept** — not a generalization or replacement of the existing per-todo Linked Todos feature. Linked Todos stays exactly as it is today: todo-to-todo only, scoped to one parent todo's own detail view (its "Todos" tab). The two features coexist and don't interact.
- **Purpose:** a Board is a named, persistent collection of *existing* todos and notes that the user assembles for their own purposes. No lifecycle assumption is baked into the feature — durable topic/project workspaces (e.g. "Kitchen Remodel", returned to over days/weeks) and short-lived working sets (e.g. "everything for today's 1:1", used once and left) are both valid; Boards doesn't need to distinguish or archive by age.
- **Scope boundary: link-only.** Boards only ever attaches *existing* todos/notes, found via search or the per-row quick-add icon (see [Add-to-board & active-board mechanics](02-add-to-board-and-active-board-mechanics.md)). It does not let you create a brand-new todo or note from within the Boards view — creation still happens through the normal Todo/Notes flows elsewhere in the app, then the item can be added to a board afterward.
- **Connection points to the rest of the app are exactly two:** a quick-add icon on every todo/note row, and a toggle/tab that opens the Boards view (see [Boards view UI shape](03-boards-view-ui-shape.md)).
