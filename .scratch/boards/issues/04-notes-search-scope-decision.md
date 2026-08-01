Type: grilling
Status: resolved

## Question

Should the Boards "search to add" bar be able to find notes (not just todos), given the Notes feature (`notes-section`) explicitly ruled search out of scope for itself?

## Answer

Yes. A new, scoped capability to search notes gets built, specifically to power the Boards "add to board" search bar. This does **not** reopen or change the main app's existing todo-only search box (`GET /api/todos/search`, driving the agenda view) — that stays exactly as it is today, unaffected. The exact endpoint shape (which fields are matched, ranking, result cap, exclusion of items already on the active board) is left to [Notes search endpoint design](08-notes-search-endpoint-design.md).
