Type: grilling
Status: resolved
Blocked by: 04

## Question

Design the notes-search capability approved in [Notes search scope decision](04-notes-search-scope-decision.md), scoped specifically to powering the Boards "add to board" search bar:

- Endpoint shape (e.g. `GET /api/notes/search?profileId=...&q=...`, mirroring the existing `GET /api/todos/search`).
- Which fields are matched — title only, or title plus folder path?
- Case-insensitivity / partial-match behavior, mirroring the existing todo search.
- Result cap, matching the "capped to a handful of results" convention already used by Linked Todos' link-search.
- Whether results should exclude notes already on the currently-active board, mirroring Linked Todos' search-excludes-already-linked behavior.

## Answer

`GET /api/notes/search?profileId=...&q=...&excludeIds=id1,id2,...` in `notes.ts`, registered before the `/:id` routes (same ordering reason `/tags`/`/search` are registered first in `todos.ts` — otherwise Express's param matcher would swallow `search` as an `:id`).

- **Matched field:** `name` only — not folder path, not body content. Folder-path matching would require walking the `NoteFolder.parentId` ancestor chain server-side (no such builder exists today; `notesTree.ts` explicitly documents "the client assembles the tree, not the server," only a flat single-level `folderName` lookup exists). Building that machinery here would cut against the established convention and duplicate whatever folder-path display logic [Boards view UI shape](03-boards-view-ui-shape.md)'s card headers need, which will live client-side anyway. Folder path stays a pure display concern, never part of the search predicate.
- **Case-insensitivity / partial match:** mirrors `GET /api/todos/search` exactly — `{ name: { $regex: q, $options: 'i' } }`; an empty/missing `q` returns the profile's notes unfiltered (same "type to filter, starts empty" default).
- **Result cap:** 6, enforced server-side via `.limit(6)` — same number as Linked Todos' client-side `slice(0, 6)`, but applied where the query runs rather than after fetching everything, sorted `{ createdAt: -1 }` (mirroring `todos/search`'s sort).
- **Excluding already-on-board notes:** an explicit `excludeIds` query param (comma-separated note ids), filtered via `_id: { $nin: excludeIds } }` **before** the `.limit(6)` cap — so a full 6 fresh results come back whenever that many exist, not fewer because some got excluded post-cap. The client computes `excludeIds` from the active board's current note-item ids and passes them in; the server does **not** resolve the active board itself. This keeps `notes.ts` decoupled from `Board`/`Profile` (it already only imports `NoteFolder`, for validation), consistent with the one-route-file-per-entity convention.
