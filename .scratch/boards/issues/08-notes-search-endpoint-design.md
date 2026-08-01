Type: grilling
Status: open
Blocked by: 04

## Question

Design the notes-search capability approved in [Notes search scope decision](04-notes-search-scope-decision.md), scoped specifically to powering the Boards "add to board" search bar:

- Endpoint shape (e.g. `GET /api/notes/search?profileId=...&q=...`, mirroring the existing `GET /api/todos/search`).
- Which fields are matched — title only, or title plus folder path?
- Case-insensitivity / partial-match behavior, mirroring the existing todo search.
- Result cap, matching the "capped to a handful of results" convention already used by Linked Todos' link-search.
- Whether results should exclude notes already on the currently-active board, mirroring Linked Todos' search-excludes-already-linked behavior.
