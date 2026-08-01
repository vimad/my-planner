Type: grilling
Status: resolved

## Question

Is there any practical cap on the number of boards per profile, or items per board?

## Answer

No cap, for now. `Board.items` and the boards-per-profile list are both unbounded — no schema-level max length, no UI warning threshold, no enforced limit anywhere in the API. Consistent with how every other reference-list/entity-list in this app (`linkedTodoIds`, categories, notes) is unbounded today. Revisit only if real usage shows the grid or dropdown UX degrading at scale.
