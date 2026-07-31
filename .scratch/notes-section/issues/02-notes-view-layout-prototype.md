Type: prototype
Status: claimed

## Question

What does the Notes view actually look like: how do you switch between the Todos view and the Notes view, how is the folder tree navigated, and how is a note edited (hosting the existing `RichTextEditor`/`ExpandableNotesEditor` — see the map's Notes section — in whatever layout this view needs)?

Leans toward a genuinely separate view rather than an overlay bolted onto the Todos layout (per the charting conversation), but the concrete look/feel — the view-switch affordance, the folder-tree widget, where create/rename/delete/move-to-folder (see [Notes scope & data model fundamentals](01-scope-data-model-fundamentals.md)) live in that layout — needs a rough, concrete prototype to react to before it can be decided, not a description in prose.

## Answer

**Winner: a refined Variant A — "Tab toggle + split pane".** Two structurally different alternatives were also built and compared live against real app chrome (a full-page mode takeover with breadcrumb card-grid browsing, and a full-screen Miller-columns overlay off an edge rail); neither was chosen — Variant A's persistent split kept both Todos and Notes feeling like first-class, low-friction destinations within the same page rather than requiring a bigger context switch.

**View switching.** The header gains a persistent "Todos / Notes" segmented tab toggle, next to the existing profile switcher/theme toggle. Switching tabs swaps only the main content area (the Categories+Agenda sections) for the Notes view — the rest of the page's chrome (header, the fixed-bottom Scratchpad bar) stays exactly as it is today, unaffected by which tab is active.

**Layout, after incorporating feedback on the first pass:** a two-pane split.
- **Left pane — a single unified tree.** Folders and notes are mixed together in one recursive tree (not folders-only with notes surfaced separately) — alphabetical at each level, per the alphabetical-ordering decision in [Notes scope & data model fundamentals](01-scope-data-model-fundamentals.md). Folders are expandable/collapsible (▾/▸), notes are leaf rows. A "Root" row at the top represents root-level items. `+ Folder` / `+ Note` buttons in the pane header create within whichever folder is currently "active" (the last-clicked folder, or the folder containing the last-opened note) — root when nothing's been clicked yet.
- **Right pane — dedicated entirely to the editor, not a list.** Browsing happens entirely in the left tree now (the first draft's right-hand "list of this folder's children" was dropped). Clicking a folder in the tree just marks it active (for `+ Folder`/`+ Note` context) — the right pane shows an empty-state placeholder ("Select a note to edit it here, or create one in '<folder>'"). Clicking a note fills the *entire* right pane, top to bottom, with a name field and the existing `RichTextEditor`/`ExpandableNotesEditor` (toolbar, enlarge-to-modal affordance and all) — no list squeezed in above it.
- **Move/delete** live as hover-reveal actions directly on each tree row (both folders and notes): "Move" opens the simple folder-picker modal from the data-model ticket; folder delete keeps the cascade-with-count confirm from that same ticket.

**Open detail for the spec, not resolved here:** the prototype has no folder-rename affordance (only note rename, via the editor pane's name field) — worth deciding when the spec is written up. Single-note delete in the prototype is immediate/unconfirmed; the spec should likely give it the same lightweight `requestConfirm` treatment every other delete in this app gets, for consistency, even though ticket 01 only specified confirm wording for the folder-cascade case.

**Primary source:** the full three-variant prototype (all variants, the switcher, and the temporary `?variant=` wiring into `App.tsx`) is preserved on branch `prototype/notes-view-variants` — not on `main`, which only carries this recorded decision. `main`'s `App.tsx` has been reverted to its pre-prototype state.

Status: resolved.
