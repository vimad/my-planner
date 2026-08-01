Type: grilling
Status: resolved

## Question

How does an item get added to a board from where it normally lives, what does "active board" mean, and what happens with zero boards, or an item that's relevant to more than one board?

## Answer

- **Quick-add icon on every row.** Every todo row (wherever todos are listed) and every note row (in the Notes tree) gets a small add/pin icon. Clicking it animates the item flying to the toggle badge (count++) and adds it directly to the **active board** — one click, no picker.
- **"Active board" = "the board currently shown in the Boards view."** These are the same single concept, not two — there is exactly one active board per profile at a time. Picking a different board from the dropdown while inside the Boards view (see [Boards view UI shape](03-boards-view-ui-shape.md)) immediately retargets both the quick-add icon and the toggle badge to that newly-selected board.
- **Zero boards yet:** clicking the quick-add icon prompts the user to name and create the first board before the item is added — no silent auto-created board.
- **Multi-board membership is allowed.** The same todo or note can belong to any number of boards simultaneously — no restriction, consistent with how Linked Todos already allows a todo to be linked from multiple parent todos.
