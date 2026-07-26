# 09 — Scratchpad: notes inbox + line promotion

**What to build:** A user can jot a quick scratch note during a meeting or chat, see it in an inbox-style list, and later select one or more lines from it to promote each into a proper todo — assigning category, priority, and date at that moment — without losing the original note.

**Blocked by:** 08 — Todo detail: priority, due date, tags, category, rich-text body

**Status:** ready-for-agent

- [ ] Backend has a ScratchNote model (`body` as a Tiptap document structured as a list of lines, each line carrying a stable id and a `promotedTodoId` defaulting to null; `archived` boolean default `false`) and REST routes: create, list, archive/delete
- [ ] A "promote line" endpoint accepts a scratch note id, a line id, and optional category/priority/dueDate, creates a new Todo from that line's text, and sets the line's `promotedTodoId` on the note
- [ ] Frontend has an inbox-style list of scratch notes (not one continuous pad), each created and edited with the same Tiptap editor used for todos, per [the scratchpad decisions on the map](../map.md)
- [ ] From an open scratch note, the user can select one or more lines and promote each into its own todo, assigning category/priority/date at that moment
- [ ] Promoted lines stay visible in the note, visually marked and linked to the todo they became
- [ ] The user can manually archive or delete a scratch note
- [ ] Backend routes are tested via `createApp()` + supertest with mocked models
- [ ] Frontend note creation and line-promotion flow are tested via React Testing Library

## Follow-up: scratchpad placement (2026-07-26)

Original placement was an inline "+ New note" button inside a full note list on
the dashboard. Prototyped three alternatives live on the dashboard route
(`?variant=A|B|C`) - see branch `prototype/scratchpad-placement-ui` for the
full exploration (floating button + drawer, inline pill + modal + grid, and
persistent bottom bar + icon rail).

**Decision:** variant C - a persistent bottom capture bar (grows in place
into an editor, always reachable) plus a left icon rail that opens a
"Scratchpad sessions" overlay panel. Folded into
`packages/frontend/src/components/Scratchpad.jsx`. Quick capture now creates
a note pre-seeded with its first line in a single `POST /api/scratch-notes`
call (the route already accepted a seeded `body`), instead of the old
create-then-patch two-step.
