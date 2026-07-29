# 02 — Wire ExpandableNotesEditor into the linked-todo notes panel

**What to build:** Swap the selected linked todo's notes editor in `TodoDetail.tsx`'s Todos tab (the split-workspace right column) from a direct `RichTextEditor` usage to `ExpandableNotesEditor`, passing through the same props it already passes today (this editor is always in edit mode, with its own independent Save button — neither changes). Enlarge/shrink state for this editor must be entirely independent of the parent todo's own notes editor from ticket 01 — enlarging one never affects the other.

**Blocked by:** 01

- [ ] The linked-todo notes panel on the Todos tab renders through `ExpandableNotesEditor` instead of `RichTextEditor` directly
- [ ] Enlarge/shrink behaves identically to the parent-notes editor (grow/shrink animation, all three dismissal paths, content preservation) for the linked todo's notes
- [ ] The linked notes panel's existing always-editable behavior and its independent Save button are unaffected
- [ ] Enlarging the linked-todo notes editor does not enlarge or otherwise affect the parent todo's own notes editor, and vice versa (both can independently be collapsed/enlarged at the same time without interfering)
- [ ] Since the linked-notes editor already remounts via its existing `key={todoKey(selectedLinkedTodo)}` when the selected linked todo changes, enlarge state naturally resets to collapsed on selection change — no special handling needed, but confirmed by test
- [ ] Extend `TodoDetail.test.tsx`: both notes editors (parent and selected linked todo) render an enlarge icon; enlarging one leaves the other in its collapsed state (independent state per instance)
- [ ] Manually verified in the running app (per `CLAUDE.md`'s manual-verification rules — use the `Test` category, link two `Test`-category todos together, clean up afterward): enlarge/shrink works on a linked todo's notes, and doesn't affect the parent notes editor's enlarge state
