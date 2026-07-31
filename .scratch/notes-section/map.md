## Destination

A full spec for a new "Notes" feature: durable, named, rich-text notes organized in a nested folder hierarchy, separate from Todos (no completion/priority/due-dates) and separate from Scratchpad (no quick-capture/promotion lifecycle). The spec should be detailed enough to hand off to implementation as its own later effort.

## Notes

- Reuses the existing `RichTextEditor` / `ExpandableNotesEditor` editing primitives (`packages/frontend/src/components/RichTextEditor.tsx`, `ExpandableNotesEditor.tsx`) already used for Todo notes — don't design a new editor, only how it's hosted/laid out for Notes.
- The app has no router; every view (Scratchpad, TodoDetail, category forms) is a section/overlay within one page (`App.tsx`). "Where Notes lives" is a layout/chrome decision, not a routing one.
- Existing REST convention: one route file + Mongoose model per entity, scoped by `profileId` (see `packages/backend/src/{models,routes}/{Category,Todo,ScratchNote}.ts`). Assume Folder/Note follow the same convention — not treated as an open decision.
- Use `/grilling` for further decisions, `/prototype` for anything about look/feel/behavior, `/domain-modeling` to record "Notes" vs "Scratchpad" vocabulary into `CONTEXT.md` as it solidifies (doesn't exist yet in this repo).
- Once every ticket is resolved and the fog below is empty, compile Decisions-so-far into `.scratch/notes-section/spec.md` — that document, not this map, is the actual destination artifact.

## Decisions so far

- [Notes scope & data model fundamentals](issues/01-scope-data-model-fundamentals.md) — Notes is a separate concept from Scratchpad, no promotion/merge between them; minimal fields (name, rich-text body, folderId, timestamps — no priority/tags/due-dates/category); folders nest without limit via `parentId`, notes may live at the root; deleting a non-empty folder cascades but the confirm dialog states the count destroyed; ordering within a folder is alphabetical; moving a note/folder uses a simple "move to folder" picker (no drag-and-drop); note→todo conversion, collaboration/sharing, version history, and search-over-notes are out of scope.
- [Notes view: layout, view-switching & editor UX](issues/02-notes-view-layout-prototype.md) — a "Todos / Notes" header tab swaps the main content area; the Notes view is a two-pane split — left is one unified alphabetical tree mixing folders and notes (expandable folders, hover-reveal Move/Delete), right pane is dedicated entirely to the note editor (`RichTextEditor`/`ExpandableNotesEditor`), showing an empty-state placeholder until a note is clicked. Two alternatives (full-page breadcrumb takeover, full-screen Miller-columns overlay) were prototyped and not chosen. Primary source (all three variants) preserved on branch `prototype/notes-view-variants`.

## Not yet specified

- Backend REST/schema surface for Folder and Note — follows the existing Category/Todo route+model pattern; now that the view (unified tree, hover Move/Delete, dedicated editor pane) is settled, this is close to specifiable directly rather than needing its own decision ticket.
- Folder rename affordance — the layout prototype only wired note rename (via the editor pane's name field); folders have no rename UI yet.
- Whether deleting a single note gets a `requestConfirm` prompt like every other delete in this app (the prototype deletes immediately) — likely just "yes, for consistency," but not yet written down as a decision.
- Empty-state copy/visuals for an empty Notes view or an empty folder.

## Out of scope

- Converting/promoting a Note into a Todo — ruled out while resolving [Notes scope & data model fundamentals](issues/01-scope-data-model-fundamentals.md); that's Scratchpad's job, Notes has no crossover.
- Multi-user collaboration / sharing — single-user app, not relevant.
- Version history / revision tracking on notes — nothing else in the app has this.
- Search over Notes (via the existing todo search box or a new one) — no forcing need yet; browse-by-folder is enough for a "small notes section."
