# 15 — Search-and-add from within the Boards view

**What to build:** A search bar inside the Boards view for attaching existing todos and notes to the active board directly, without needing to find them by their normal row first. See `.scratch/boards/spec.md` for full context.

**Blocked by:** 12 — Boards tab: browse boards, card grid, inline editing.

**Status:** ready-for-agent

- [ ] Search bar in the Boards view queries todos and notes together as the user types.
- [ ] Todo results: client-side filter over the already-loaded `todosList` — title substring match, items already on the active board excluded, capped to 6 — mirroring Linked Todos' own link-search exactly (no new backend call).
- [ ] Note results: `GET /api/notes/search?profileId=...&q=...&excludeIds=...` (from ticket 11), passing the active board's current note-item ids as `excludeIds`.
- [ ] Selecting a result from either list adds it to the active board (`PATCH /api/boards/:id`, appending an `{itemType, itemId}` entry) and it disappears from the search results (now excluded) and appears in the grid.
- [ ] Frontend tests cover: typing filters both todo and note results, results already on the active board are excluded from both lists, selecting a todo result and a note result both add the item and update the grid, and the combined result set respects the 6-per-type cap.
