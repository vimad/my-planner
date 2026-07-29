# 03 — Linked-todo notes panel: gate the existing Save button on dirty state

**What to build:** In `TodoDetail`'s Todos tab, the selected linked todo's notes panel currently shows its "Save" button unconditionally whenever a linked todo is selected. Using the primitive built in ticket 01, that button (and a matching light border on the notes box) becomes conditional on the panel's content actually differing from what's saved for that linked todo — the same rule and visual treatment as the parent notes box in ticket 02, so both notes surfaces in the popup behave identically.

**Blocked by:** 01 — RichTextEditor dirty-tracking primitive

**Status:** ready-for-agent

- [ ] The linked-notes `ExpandableNotesEditor` is passed `savedContent={selectedLinkedTodo.body}` (the real database value for that linked todo, never `linkedNotesOverrides`) and `onDirtyChange` wired to local `linkedNotesDirty` state.
- [ ] The Save button in the linked-notes panel's header row only renders while `linkedNotesDirty` is true (replacing its current unconditional rendering); the notes box shows the same light accent border used in ticket 02 while dirty.
- [ ] Selecting a different linked todo (which already remounts the editor via its existing `key={todoKey(selectedLinkedTodo)}`) correctly re-evaluates dirty state against the newly-selected todo's own saved body — including showing dirty immediately if that todo has a pending unsaved edit sitting in `linkedNotesOverrides` from earlier in the session.
- [ ] On successful save, `handleSaveLinkedNotes` calls the linked-notes editor's `markSaved()` handle method so the border/button clear synchronously, in addition to its existing behavior of clearing the entry from `linkedNotesOverrides`.
- [ ] New/updated `TodoDetail.test.tsx` cases: no Save button or border shows for a freshly-selected linked todo with unmodified notes; editing produces both; a successful save clears both; switching to a different linked todo and back reflects each one's own independent dirty state correctly (editing one linked todo's notes never marks a different linked todo, or the parent's own notes, as dirty).
