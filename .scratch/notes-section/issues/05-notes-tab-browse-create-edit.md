# 05 — Notes tab: browse, create, and edit notes

**What to build:** The first demoable slice of the Notes view — a header tab that swaps into a folder/note tree with a dedicated editor pane, backed by the real API from ticket 04. See `.scratch/notes-section/spec.md` for full context (including the winning layout prototype, preserved on branch `prototype/notes-view-variants`).

**Blocked by:** 04 — Note & NoteFolder entities: models + full CRUD API.

**Status:** ready-for-agent

- [ ] Header gains a "Todos / Notes" segmented tab next to the profile switcher/theme toggle; switching tabs swaps the Categories+Agenda content area for the Notes view — the rest of the page (header, Scratchpad bar) is unaffected.
- [ ] Notes view is a two-pane split: left pane is a folder+note tree fetched from `/api/note-folders` and `/api/notes` for the active profile; right pane hosts the editor.
- [ ] Tree mixes folders and notes together in one recursive listing, sorted alphabetically at every level (no manual reordering); folders are expandable/collapsible; a "Root" row represents root-level items.
- [ ] `+ Folder` / `+ Note` buttons in the tree pane header create within whichever folder is currently "active" (the last-clicked folder, or the folder containing the last-opened note; root by default).
- [ ] Right pane shows an empty-state placeholder (`Select a note to edit it here, or create one in "<active folder name>".`) until a note is selected.
- [ ] Selecting a note fills the entire right pane, top to bottom, with an editable name field and `RichTextEditor`/`ExpandableNotesEditor` (reused as-is — toolbar, enlarge-to-modal, dirty-tracking included; no new editor built).
- [ ] Editing a note's name or body persists via `PATCH /api/notes/:id`.
- [ ] Switching the active profile re-scopes the tree to the newly active profile's folders/notes.
- [ ] Frontend tests (RTL + Vitest, mocking `fetch`, mirroring existing component tests) cover: tab toggle swaps the content area, tree renders folders+notes mixed alphabetically, creating a folder and a note, selecting a note opens the editor pane pre-filled, and edits save.
