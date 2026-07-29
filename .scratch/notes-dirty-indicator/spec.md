# Spec: Notes Unsaved-Changes Indicator + Always-Editable Notes

**Status:** ready-for-agent

## Problem Statement

The parent todo's own "Notes" section in `TodoDetail` requires an extra click ("Edit" / "Done editing") before the user can type anything, unlike the linked-todo notes panel on the Todos tab, which is always editable. Separately, neither notes surface gives any visual feedback about whether there are unsaved changes: the linked-notes panel always shows a "Save" button regardless of whether anything actually changed, and the parent's own notes have no independent save affordance at all — a body edit only reaches the database via the popup's single all-fields footer "Save" button. There's no way to look at either notes box and tell "this differs from what's in the database right now" versus "this is exactly what's saved."

## Solution

Two changes, applied consistently to both notes surfaces inside `TodoDetail` (the parent todo's own Notes tab, and the selected linked todo's notes panel on the Todos tab):

1. **Always editable.** Remove the parent todo's own "Edit" / "Done editing" toggle. Its notes box becomes editable immediately, the same way the linked-notes panel already is — no click required to start typing.
2. **Unsaved-changes indicator.** Each notes box tracks whether its live document currently differs from the value last known to be saved in the database. While it differs, the box shows a light accent border and a small "Save" button appears (reusing the linked-notes panel's existing button placement/style); clicking it persists just that note's body immediately, independent of the popup's other fields. Once the save succeeds, the border and the button both disappear. While clean (nothing unsaved), neither the border nor the button is shown. This makes the linked-notes panel's existing always-visible Save button conditional on the same "differs from DB" check, so both notes boxes behave identically.

The popup's main footer "Save"/"Add" button (which saves every field on the parent todo, including its notes body) keeps its current behavior exactly as-is — always present, always enabled, unaffected by either notes box's dirty state. It doesn't need to special-case clearing the parent notes indicator, because a successful click there already closes the whole popup (`onSave` resolving unmounts `TodoDetail`); reopening the todo always starts from a fresh, clean state.

The dirty check itself is done with Tiptap/ProseMirror's built-in structural document equality (`Node.eq()`), not by hand-rolling a string/JSON diff — see Implementation Decisions for the performance rationale.

## User Stories

1. As a user opening an existing todo, I want its Notes box to be editable right away, so that I don't need an extra click before I can start typing.
2. As a user opening an existing todo, I want the Notes box to show no border highlight and no Save button when I haven't changed anything, so that the UI doesn't nag me about changes that don't exist.
3. As a user editing the parent todo's notes, I want a light border to appear around the notes box as soon as my content differs from what's saved, so that I have a clear, ambient signal that this section has unsaved work.
4. As a user editing the parent todo's notes, I want a small Save button to appear next to the Notes label once I've made a change, so that I can persist just my notes edit without touching any other field on the todo.
5. As a user who clicks that notes Save button, I want the border and the button to both disappear once the save completes, so that I get immediate confirmation the change is safely persisted.
6. As a user who edits notes and then edits them back to exactly the last-saved content (e.g. via undo), I want the border/Save button to disappear again, so that the indicator reflects real content differences, not just "was this box touched."
7. As a user working in the Todos tab, I want the selected linked todo's notes panel to follow the same rule — border and Save button appear only once its content actually differs from what's saved for that linked todo, not unconditionally as today — so that both notes surfaces behave identically.
8. As a user, I want switching which linked todo is selected (or switching away from and back to the Notes tab) to correctly reflect dirty state for whatever content is currently showing — including any not-yet-saved edit I made before switching away — rather than incorrectly showing "clean" just because the editor was remounted.
9. As a user, I want clicking the popup's main footer Save/Add button to keep behaving exactly as it does today (saves every field, including the current notes body, then closes the popup) — this feature doesn't add any new gating, confirmation, or side effect to that button.
10. As a user creating a brand-new todo (the "Add" popup), I want its Notes box to also be immediately editable with no Edit-toggle click required, consistent with the always-editable behavior everywhere else, even though — since the todo doesn't exist yet — there's no independent per-notes Save button or border shown there; the only way to persist a new todo's notes is still the footer "Add" button.
11. As a user, I want typing in a notes box to stay smooth with no perceptible lag from the dirty-check, so that the feature is invisible from a performance standpoint.
12. As a developer, I want the dirty check implemented using Tiptap/ProseMirror's own document-equality primitive rather than a hand-written string or JSON comparison, so that the logic is robust to any structurally-equivalent-but-differently-serialized document and isn't something we maintain ourselves.
13. As a developer, I want the per-keystroke cost of dirty-checking confined to the editor component itself, so that the rest of `TodoDetail` doesn't re-render on every keystroke just because this feature exists.

## Implementation Decisions

- **Remove the Edit toggle.** Delete `TodoDetail`'s `editingBody` state and the "Edit" / "Done editing" button. The parent todo's `ExpandableNotesEditor` is passed `editable` as always-true (for an existing todo) instead of `editingBody`, matching the linked-notes panel's existing always-editable behavior. For the new-todo ("Add") popup, notes are likewise always editable — that popup already has no independent notes-save path (see below) and none is added.

- **Dirty tracking lives in `RichTextEditor`; the border/Save UI lives in `TodoDetail`.** `RichTextEditor` keeps an internal ref to a "saved baseline" ProseMirror document and, on every transaction, compares the live `editor.state.doc` against it using ProseMirror's built-in `doc.eq(other)` (a structural equality check exposed via `@tiptap/pm/model`) — not `JSON.stringify` or any custom diffing. `TodoDetail` (via `ExpandableNotesEditor`, which passes the props straight through to its wrapped `RichTextEditor`) owns rendering the light border and the Save button, the same way it already owns the linked-notes panel's Save button today — this feature doesn't introduce a second place that renders save-affordance UI.

- **Baseline vs. initial render content are distinct.** `RichTextEditor` already takes a `content` prop used to seed the editor's initial document, which in `TodoDetail` today can be an in-memory, not-yet-persisted override (`bodyOverride` / `linkedNotesOverrides`, captured when switching tabs or switching the selected linked todo so an in-progress edit survives the remount). Seeding the dirty baseline from that same `content` value would be wrong — it would make a remounted editor with pending unsaved edits appear falsely "clean." `RichTextEditor` therefore takes a second, distinct prop for the baseline (e.g. `savedContent`), which `TodoDetail` always sets to the actual last-known-database value (`todo.body` for the parent's own notes; the selected linked todo's `body` for the linked-notes panel) — never to the override. If `savedContent` is omitted, it defaults to `content`, so other callers of `RichTextEditor`/`ExpandableNotesEditor` (`Scratchpad.tsx`) that don't care about dirty tracking are unaffected.

- **Reporting dirty transitions without lifting per-keystroke state.** `RichTextEditor` computes the boolean via a `useEditorState` selector (the same subscription pattern already used for `Toolbar`'s bold/italic/etc. state), so the comparison itself re-runs locally on every transaction without forcing `TodoDetail` to re-render on every keystroke. A new optional prop, `onDirtyChange?: (dirty: boolean) => void`, is invoked (from a `useEffect` keyed on that boolean, not on every transaction) only at the two boundary crossings — clean→dirty and dirty→clean — which is what `TodoDetail` uses to drive its local `notesDirty` / `linkedNotesDirty` state and re-render its header row. Net effect: the expensive-looking "diff on every keystroke" work never actually causes a parent re-render; `TodoDetail` only re-renders on the rare crossing events.

- **Clearing the baseline after an independent save.** `RichTextEditor`'s existing imperative handle (`RichTextEditorHandle`, already exposing `getJSON()`) gains a `markSaved(): void` method that resets the internal baseline ref to the current document. `TodoDetail` calls it (via its existing `bodyRef/linkedNotesRef`) immediately after its own independent per-notes save succeeds, so the border/button clear synchronously rather than waiting on the next props update from a background refetch.

- **New per-notes save path for the parent todo, reusing the existing linked-notes save callback.** `App.tsx`'s `handleSaveLinkedTodoField` (wired today only to `TodoDetail`'s `onSaveLinkedTodo` prop) already does exactly what's needed — PATCH a single todo's `body` by id, without closing any popup or touching other fields — it's written generically ("saves a single field on *any* todo"), not linked-todo-specific. `TodoDetail` reuses this same prop for the parent todo's own new "Save notes" button (calling it with the parent todo's own `id`), rather than adding a duplicate prop/handler. The prop is renamed to something generic (e.g. `onSaveNotes`) to reflect that it's no longer linked-todo-specific, with `App.tsx`'s wiring updated accordingly; no new backend endpoint or new `App.tsx` handler is introduced.
  - New-todo popup: this prop continues to be omitted there (as `onSaveLinkedTodo` already is today), since a not-yet-created todo has no id to PATCH against — consistent with story 10.

- **Linked-notes panel's existing Save button becomes conditional.** The button already present in the Todos tab's right-hand pane (currently always rendered whenever a linked todo is selected) is gated behind `linkedNotesDirty`, using the same `onDirtyChange`/`markSaved` mechanism as the parent's notes. `linkedNotesDirty` is local `TodoDetail` state, naturally reset to a fresh (clean) value whenever the linked-notes editor remounts — selecting a different linked todo already remounts it via its existing `key={todoKey(selectedLinkedTodo)}`, and its initial `savedContent` (the freshly-selected todo's real `body`) will correctly disagree with any leftover `linkedNotesOverrides[...]` entry from a prior unsaved edit, per the baseline-vs-content distinction above.

- **Visual treatment of the "light border".** Both notes boxes' wrapping container swaps its neutral `border-slate-200` / `dark:border-white/10` for a border drawn from the app's existing accent color already used for interactive/focus states elsewhere in this popup (e.g. the fuchsia focus-ring token on the title/date/category inputs), rather than introducing a new color. The same treatment is used in both places for visual parity.

- **No behavior change to the footer Save/Add button.** It keeps sending the full `TodoSavePatch` (including whatever the notes editor's `getJSON()` currently holds) exactly as it does today, and keeps closing the popup on success (`onSave` resolving already triggers `setSelectedTodo(null)`/equivalent in `App.tsx`). No new logic is added there to read or clear either notes box's dirty state.

## Testing Decisions

- Good tests here assert observable, user-facing behavior — border/Save-button presence tied to actual content changes, and disappearance after a successful save — not implementation details like the internal ref holding the baseline doc or exactly which ProseMirror API is called.
- **`RichTextEditor.test.tsx`** (extend existing file, following its current React Testing Library conventions):
  - A freshly-mounted editor with matching `content`/`savedContent` reports clean (no `onDirtyChange(true)` call).
  - Typing/editing content triggers `onDirtyChange(true)` exactly once at the transition (not on every keystroke after that).
  - Editing content back to exactly match `savedContent` (e.g. undo) triggers `onDirtyChange(false)`.
  - Calling the exposed `markSaved()` handle method while dirty resets to clean (`onDirtyChange(false)`) without changing the document content.
  - A mismatched `content` vs. `savedContent` at mount time (simulating the remount-with-pending-edit case) reports dirty immediately, without requiring any further edits.
- **`TodoDetail.test.tsx`** (extend existing file):
  - The parent notes box is editable immediately on open, with no "Edit" button present anywhere in the popup.
  - No border/Save button shows for the parent notes box when nothing has changed; typing produces both; a successful save (mocked `onSaveNotes`) clears both.
  - The linked-notes panel shows no Save button (replacing the current always-shown assertion) until its content is changed, then shows it, then a successful save clears it.
  - Switching the Notes tab away and back (or switching selected linked todo) with an unsaved, uncommitted edit still shows the box as dirty after the remount.
  - Clicking the footer Save/Add button is unaffected by either notes box's dirty state — same patch shape, same close-on-success behavior as before this spec.
- No backend changes are introduced by this spec (the PATCH-single-field endpoint already exists and is exercised today via the linked-notes path), so no new backend tests are needed.

## Out of Scope

- Any dirty/unsaved indicator for the popup's other fields (title, priority, due date, category, tags, recurrence, office-linked, or the linked-todo list itself) — this spec is scoped to the two rich-text notes boxes only.
- Any change to the footer Save/Add button's own gating, confirmation, or disabled state based on any field's dirty status.
- Auto-save / debounced background saving of notes — the per-notes Save button remains an explicit user action.
- Warning the user (e.g. via `beforeunload` or a confirm dialog) about unsaved notes when closing the popup or navigating away.
- Any change to `Scratchpad.tsx`'s or `ScratchNoteCard.tsx`'s use of `RichTextEditor` — they don't opt into `savedContent`/`onDirtyChange` and keep behaving exactly as today.
- Conflict handling if the underlying todo's body changes elsewhere (e.g. a concurrent edit) while a notes box is open and dirty — out of scope, same as the app's existing lack of such handling elsewhere.

## Further Notes

- This spec builds directly on `ExpandableNotesEditor` (from the `enlarge-notes-editor` spec) as the shared component both notes boxes already render through — no new wrapper component is introduced, only new props threaded through the existing one.
- The rename of `onSaveLinkedTodo` to a more generic name is a small, mechanical follow-on to reusing it for the parent's own notes; `App.tsx`'s underlying `handleSaveLinkedTodoField` function needs no behavioral change, only (optionally) a matching rename for clarity.
