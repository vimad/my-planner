# 01 — RichTextEditor dirty-tracking primitive

**What to build:** `RichTextEditor` gains the reusable pieces needed to know "does my current document differ from what's actually saved in the database" — without any hand-rolled string/JSON diffing, and without forcing whatever renders it to re-render on every keystroke. `ExpandableNotesEditor` passes the new props straight through. No existing call site (`TodoDetail`'s two notes boxes, `Scratchpad.tsx`, `ScratchNoteCard.tsx`) is wired up to use any of this yet, and none of their current behavior changes — this ticket is infrastructure only, consumed by tickets 02 and 03.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] `RichTextEditor` accepts a new optional `savedContent` prop, distinct from the existing `content` prop, representing the last-known-saved-to-database document. When omitted, it defaults to `content` (so existing callers that don't pass it are fully unaffected).
- [ ] `RichTextEditor` keeps an internal baseline ref to the ProseMirror document, seeded from `savedContent` at mount, and compares the live `editor.state.doc` against it on every transaction using ProseMirror's built-in `doc.eq(other)` (`@tiptap/pm/model`) — not `JSON.stringify` or any custom diff.
- [ ] The comparison is computed via a `useEditorState` selector (same subscription pattern already used for `Toolbar`'s bold/italic state), so the per-keystroke cost stays local to `RichTextEditor` and does not by itself force a parent re-render.
- [ ] `RichTextEditor` accepts a new optional `onDirtyChange?: (dirty: boolean) => void` prop, invoked only at the two boundary crossings (clean→dirty, dirty→clean) — not on every transaction.
- [ ] `RichTextEditorHandle` (the existing imperative handle, today exposing `getJSON()`) gains a `markSaved(): void` method that resets the internal baseline ref to the current document (without changing the document's content), immediately flipping to clean.
- [ ] `ExpandableNotesEditor` accepts and passes through `savedContent` and `onDirtyChange` to its wrapped `RichTextEditor`, and its own exposed handle continues to proxy `markSaved()` the same way it already proxies `getJSON()`.
- [ ] New `RichTextEditor.test.tsx` cases: clean at mount when `content`/`savedContent` match; `onDirtyChange(true)` fires exactly once at the edit transition (not per keystroke); editing back to exactly match `savedContent` fires `onDirtyChange(false)`; calling `markSaved()` while dirty resets to clean without altering content; a mismatched `content` vs. `savedContent` at mount reports dirty immediately with no further edits required.
- [ ] No behavior change for any existing caller (`TodoDetail`, `Scratchpad`, `ScratchNoteCard`) — all continue to omit the new props and render identically to before this ticket.
