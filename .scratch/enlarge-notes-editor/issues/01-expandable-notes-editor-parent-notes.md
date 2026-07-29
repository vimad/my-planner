# 01 — Build ExpandableNotesEditor and wire it into the parent todo's Notes-tab editor

**What to build:** A reusable `ExpandableNotesEditor` component that wraps the existing `RichTextEditor` and adds an enlarge icon. Clicking it grows the editor with a FLIP-style animation (transforming from its exact original on-screen position/size) into a large, centered overlay panel above its own backdrop, stacked above the `TodoDetail` popup itself — visually consistent with the app's existing dark-glass popup styling. The user can shrink it back down via a shrink icon, the `Escape` key, or clicking the backdrop (clicking inside the panel does not dismiss); shrinking reverses the same animation back into the original inline slot. The same underlying `RichTextEditor` instance and Tiptap document is used throughout, so no content, cursor position, or edit/view mode is ever lost or reset by enlarging or collapsing. Wire this into `TodoDetail.tsx`'s existing parent-todo notes editor (the Notes tab), replacing its direct `RichTextEditor` usage.

**Blocked by:** None — can start immediately

- [ ] `ExpandableNotesEditor` renders its child `RichTextEditor` inline by default, with an enlarge icon visible
- [ ] Clicking the enlarge icon transitions to an enlarged overlay state (backdrop + large centered panel), animating from the inline editor's original position/size rather than appearing instantly or via a generic fade
- [ ] While enlarged, the shrink icon, `Escape` key, and a click on the backdrop each independently collapse back to the inline state; clicking inside the enlarged panel does not collapse it
- [ ] The collapse animation visibly returns the panel to its original inline slot before the overlay is torn down
- [ ] The same `RichTextEditor` instance is preserved across both transitions — no `key` change tied to enlarge state, no remount; content typed before enlarging is still present after enlarging and after collapsing
- [ ] The `editable` prop (view vs. edit mode) passed through to `RichTextEditor` is unaffected by and independent of enlarge state — a view-mode editor stays read-only enlarged, an edit-mode editor stays editable enlarged
- [ ] While enlarged, the backdrop blocks pointer interaction with everything behind it, including the `TodoDetail` popup
- [ ] No new animation library is added to `package.json` — implemented with plain CSS transitions/transforms
- [ ] `RichTextEditor.tsx` itself is not modified; its other call sites (`ScratchNoteCard.tsx`, `Scratchpad.tsx`) are untouched
- [ ] `TodoDetail.tsx`'s parent-todo Notes-tab editor renders through `ExpandableNotesEditor` instead of `RichTextEditor` directly, passing through the same props it already passes today
- [ ] New `ExpandableNotesEditor.test.tsx` covers: default inline render with enlarge icon; enlarge transitions to overlay state; each of the three dismissal paths (icon, Escape, backdrop click) collapses independently; click-inside-panel does not collapse; content/document persists across enlarge and collapse; `editable` behavior is identical collapsed vs. enlarged
- [ ] Manually verified in the running app (per `CLAUDE.md`'s manual-verification rules — use the `Test` category, clean up afterward): enlarge/shrink works on a real todo's notes in both view and edit mode, animation looks smooth, and content is never lost
