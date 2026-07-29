# Spec: Enlarge Notes Editor

**Status:** ready-for-agent

## Problem Statement

The rich-text notes editor in a todo's detail popup is cramped — both the parent todo's own "Notes" tab and the "Todos" tab's linked-todo notes panel constrain the editor to a small fixed area inside the already-modal-sized `TodoDetail` popup. When the user is reading a long note or doing any real writing, they have to scroll within a tiny box instead of using the screen space available to them, whether they're just viewing the note or actively editing it.

## Solution

Add a small "enlarge" icon to the notes editor's toolbar area, present in both places the shared `RichTextEditor` is used inside `TodoDetail` (the parent todo's own notes on the Notes tab, and the selected linked todo's notes on the Todos tab), and in both view mode and edit mode. Clicking it grows the editor with a smooth animation into a large, centered overlay panel — similar in visual weight to the `TodoDetail` popup itself — sitting above its own backdrop on top of everything else, including the `TodoDetail` popup underneath. The animation grows from the editor's exact original on-screen position and size (a FLIP-style transform), not a generic fade-in. A shrink icon (plus Escape key or backdrop click) reverses the same animation, shrinking the panel back down until it exactly re-fits into its original inline slot, at which point the overlay is torn down and the inline editor is what's left. The same underlying editor instance and document is used throughout — enlarging or collapsing never remounts the editor or loses in-progress unsaved content.

## User Stories

1. As a user viewing a todo's notes (read-only, not currently editing), I want an enlarge icon on the notes editor, so that I can read a long note more comfortably without it being cramped in the small popup.
2. As a user editing a todo's notes, I want the same enlarge icon available while I'm actively typing, so that I can get more room to write without having to stop editing first.
3. As a user viewing or editing a linked todo's notes in the Todos tab's split workspace, I want the same enlarge icon there too, so that the experience is consistent regardless of which notes editor I'm using.
4. As a user, I want the editor to visibly grow from where it currently sits into its enlarged size, rather than just popping into existence somewhere else on screen, so that the transition feels continuous and I don't lose track of what I was looking at.
5. As a user, I want the enlarged editor to appear above everything else, including the todo popup it grew out of, so that it functions like a proper full-attention view for reading/writing.
6. As a user, I want a clear way to shrink the editor back down — clicking a shrink icon, pressing Escape, or clicking outside the enlarged panel — so that I have multiple familiar, low-friction ways to return to where I was.
7. As a user, I want the shrink animation to visibly return the editor to its exact original spot in the popup, so that the transition feels reversible and I land back exactly where I started.
8. As a user who was actively typing when I enlarged the editor, I want my cursor position and any in-progress unsaved text to be preserved through both the enlarge and shrink animations, so that expanding the view never costs me my current edit.
9. As a user with a linked todo's notes open, I want the enlarge/shrink behavior to work independently of the parent todo's own notes editor — enlarging one never affects the other's state — so that the two editors remain clearly separate.
10. As a user, while the enlarged overlay is open, I want the rest of the app (including the `TodoDetail` popup underneath) to be inert/non-interactive, so that I can't accidentally trigger something behind the enlarged view.
11. As a user on the Notes tab (parent todo's own notes, which supports a view/edit toggle), I want enlarging to preserve whichever mode — view or edit — I was already in, so that enlarging doesn't unexpectedly drop me into editing (or out of it).
12. As a user, I want the enlarged panel's own visual style (dark glass surface, rounded corners, backdrop) to feel consistent with the rest of the app's popup styling, so that it doesn't feel like a bolted-on, mismatched piece of UI.
13. As a developer, I want the enlarge/shrink affordance built as a single reusable piece rather than duplicated separately for the parent-notes and linked-notes call sites, so that both stay in sync automatically as the behavior evolves.
14. As a developer, I want the enlarge/shrink animation implemented with the app's existing plain-CSS-transition idiom, so that no new animation library dependency is introduced for this one feature.
15. As a user, if I resize my browser window or the layout shifts while the enlarged view is open, I don't need pixel-perfect shrink-back tracking of a moved original slot — it's acceptable for the shrink animation to target the editor's original slot as last known/measured, so this doesn't need to be a scroll/resize-reactive live-tracked animation.
16. As a user, I want clicking the enlarge icon to have no effect on unsaved changes elsewhere in the popup (e.g. the parent todo's other fields, or an in-progress link/unlink action), so that enlarging notes is an isolated, side-effect-free action.

## Implementation Decisions

- **New shared component**: introduce a wrapper component (working name `ExpandableNotesEditor`) that owns the enlarge/collapse boolean state, renders the enlarge/shrink icon button positioned in the existing toolbar-adjacent area, and wraps a single child `RichTextEditor` instance. `RichTextEditor` itself is not modified — it has no knowledge of enlarge state, keeping the "same instance renders both view and edit mode" guarantee intact and extending it to "same instance renders both inline and enlarged states."
- **Two call sites, one component**: `TodoDetail.tsx` is updated at both of its existing `RichTextEditor` usages (the parent todo's Notes-tab body, and the selected linked todo's notes panel) to render through `ExpandableNotesEditor` instead of `RichTextEditor` directly, passing through the same `content`/`editable`/`toolbar`/`contentClassName` props it already passes today. No other call site (`ScratchNoteCard.tsx`, `Scratchpad.tsx`) is changed by this spec.
- **Overlay structure**: when enlarged, `ExpandableNotesEditor` renders a `fixed inset-0` backdrop layer (matching `TodoDetail`'s own `bg-black/60` backdrop convention) at a higher `z-index` than `TodoDetail`'s `z-50`, with a large centered panel inside it (dark glass surface — same `rounded-2xl`/`shadow-xl`/dark-panel background tokens `TodoDetail` already uses) sized to occupy most of the viewport (e.g. a large max-width/max-height with margin, not edge-to-edge fullscreen). The same `RichTextEditor` instance (and its toolbar, if `toolbar` was passed) is rendered inside this panel while enlarged, and inside the normal inline container while not.
- **FLIP-style animation**: on enlarge, measure the inline container's `getBoundingClientRect()` immediately before the state flips ("First"), let the overlay layout render at its final large size ("Last"), then apply an inverting transform (translate + scale) so the overlay panel visually starts exactly where the inline container was, and animate that transform to identity via a CSS transition (plain `transition`/`transform`, no animation library) so it visibly grows into place. Collapse plays the same transform in reverse — animate from identity back to the inverted (small, original-position) transform — and only unmounts the overlay / restores the inline render after the transition ends (`transitionend`, or a matched-duration timeout as fallback).
- **Trigger and dismissal**: the enlarge icon button toggles state on click. While enlarged, dismissal is available via: the same icon (now showing a shrink affordance) in the overlay panel, the `Escape` key (attached only while enlarged), and a click on the backdrop area outside the panel (clicks inside the panel do not dismiss). All three call the same collapse path.
- **Modality while enlarged**: the overlay sits above `TodoDetail` in stacking order and its backdrop blocks pointer interaction with everything behind it (consistent with how `TodoDetail`'s own backdrop already blocks the page behind it). No changes are needed to `TodoDetail`'s own event handling — the higher z-index overlay is sufficient.
- **Content/state preservation**: `ExpandableNotesEditor` does not remount `RichTextEditor` when toggling enlarge state (no `key` change tied to the enlarge boolean) — the same editor instance, its Tiptap document, cursor/selection, and scroll position carry over across both transitions. `editable` continues to be driven by whatever the caller currently passes (the parent's view/edit toggle, or "always true" for linked notes), independent of and unaffected by enlarge state.
- **Original-position tracking**: the inline slot's rect is measured once at the moment of enlarging (and again at the moment of collapsing, from wherever the overlay's implied "return point" is) — there is no live resize/scroll observer keeping the target position continuously in sync while enlarged, per the out-of-scope note on window-resize edge cases.
- **No new dependency**: implemented with plain CSS transitions/transforms (Tailwind arbitrary-value utilities and/or a small amount of inline `style` for the computed FLIP transform, consistent with how `TodoDetail`'s existing `transition-[max-width] duration-150` and the dnd-kit inline-transform usage already mix conventions in this codebase). No animation library is added to `package.json`.
- **Icon**: use the existing icon set/pattern already in use elsewhere in `TodoDetail`/toolbar buttons (whatever icon component or inline SVG convention `RichTextEditor`'s toolbar buttons already follow) for the enlarge icon (e.g. an expand/maximize glyph) and its shrink counterpart (e.g. a minimize/compress glyph) while enlarged.

## Testing Decisions

- Good tests here assert observable, user-facing behavior — the enlarge/shrink UI state, dismissal paths, and content preservation — not implementation details like the exact CSS transform values, transition duration numbers, or which internal ref holds the measured rect.
- **Frontend** (new `packages/frontend/src/components/ExpandableNotesEditor.test.tsx`, following the existing React Testing Library conventions already used in `RichTextEditor.test.tsx` and `TodoDetail.test.tsx`):
  - Renders the child `RichTextEditor` inline (collapsed) by default, with an enlarge icon button visible.
  - Clicking the enlarge icon puts the component into an enlarged state (e.g. an overlay/backdrop element becomes present in the DOM) and the editor is still rendered and interactive within it.
  - While enlarged, pressing `Escape`, clicking the backdrop, and clicking the shrink icon each independently collapse back to the inline state (three separate test cases).
  - Clicking inside the enlarged panel (not the backdrop) does not collapse it.
  - Content typed/present in the editor before enlarging is still present (same document) after enlarging, and again after collapsing — proving the same editor instance persists across both transitions rather than remounting.
  - The `editable` prop passed through continues to control edit vs. view mode identically whether collapsed or enlarged (e.g. a view-mode editor stays read-only in its enlarged form too).
- **`TodoDetail.tsx` integration** (extend existing `TodoDetail.test.tsx`): both the parent notes editor and the selected linked todo's notes editor render an enlarge icon, and enlarging one does not put the other into an enlarged state (independent state per instance).
- No new backend changes are introduced by this spec, so no backend tests are needed.

## Out of Scope

- Any change to `RichTextEditor.tsx` itself, or to its other call sites (`ScratchNoteCard.tsx`, `Scratchpad.tsx`).
- Live-tracking the original inline position via resize/scroll observers — the shrink animation targets a last-measured position, not a continuously-updated one.
- Any new animation library dependency (e.g. Framer Motion).
- Making the enlarged view resizable, draggable, or independently positionable by the user beyond the single centered enlarged size.
- Persisting "was enlarged" state across a page reload, tab switch, or popup close/reopen — enlarge state always resets to collapsed when the component remounts (e.g. switching which linked todo is selected, since that already remounts the linked-notes editor via its existing `key`).
- Adding the enlarge affordance to any other rich-text surface in the app (scratchpad notes) — this spec is scoped to the two `TodoDetail` notes editors only.
- Mobile/touch-specific gesture handling beyond standard click/tap and Escape-key support.

## Further Notes

- `TodoDetail.tsx`'s own popup currently has zero open/close animation (it appears/disappears via conditional render) and only one existing transition precedent, `transition-[max-width] duration-150` when switching to the Todos tab. This spec introduces the first FLIP-style transform animation in the codebase; if it works well, it may be worth later revisiting `TodoDetail`'s own open/close for consistency, but that's explicitly not part of this spec.
- The linked-todo notes panel currently has no view/edit toggle (always editable); this spec doesn't change that — the enlarge/shrink behavior simply applies on top of whatever mode each editor is already in.
- Since the linked-notes editor remounts (via its `key={todoKey(selectedLinkedTodo)}`) whenever the user selects a different linked todo, enlarge state for that panel naturally resets to collapsed on selection change — this is expected and consistent with "As a developer" story 13/the out-of-scope note on state persistence, and needs no special handling.
