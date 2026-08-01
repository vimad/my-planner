# Weekly progress summary: view design & entry point

Type: prototype
Status: resolved

Prototype: branch `prototype/weekly-summary-view` (throwaway, not merged), `packages/frontend/src/weekly-summary-prototype/`.

## Question

Build a rough, concrete UI prototype (per `/prototype`) of the weekly progress summary view, to raise the fidelity of the design discussion before it's locked into the spec. Use mock/sample data — this doesn't depend on the compute-strategy research ticket.

Cover, per the map's Notes ("Insight ideas folded into destination"):

- **Overall layout**: week selector (Mon–Sun), per-category sections, each with the three buckets (Completed this week / Action taken this week / No action taken this week) per map.md's settled bucket definitions.
- **Category rollup counts** — a scannable one-line summary per category above the detail lists (idea 2).
- **Week navigation** — prev/next-week controls and a "jump to this week" affordance, not just a single isolated week (idea 3).
- **Multi-segment display** — when a todo has more than one dated segment within the selected week, show all of them under that todo, not just the latest (idea 4).
- **Completed-item carry-over hint** — for "Completed this week," explore optionally surfacing the last action segment before completion (idea 5).
- **Entry point / toggle**: how you switch into this view from the rest of the app. Prior art to react to: the existing `activeTab` tab strip (`'todos' | 'notes' | 'boards'` in `App.tsx`) and the `Ctrl+A` → `BoardSwitcherModal` shortcut+modal pattern (`components/BoardSwitcherModal.tsx`). Decide (or prototype a couple of options for reaction): a fourth tab, a modal/overlay reached by shortcut, or something else.

This is HITL — build something concrete for the user to react to, then converse to refine it. Note the user's own framing: "prototypes might give me more clarity when I see those features" — expect iteration, not a one-shot build.

## Answer

**Winner: Variant A — Category Dashboard, as a 4th top-level tab.**

Three structurally different variants were built against shared mock data (segments, `completedAt`, multi-segment todos, and every bucket populated): A (category-first cards on a new "Summary" tab, expandable per category), B (compact accordion in a `Ctrl+`-shortcut slide-over panel, docked right), C (day-first "Weekly Board" with Mon–Sun columns and category-color chips, entered via a persistent docked badge). All three covered week nav (prev/next + "this week" jump), per-category rollup counts, multi-segment display per todo, and the completed-item carry-over hint. The user picked **A** after reacting live.

**Design settled by Variant A, to carry into the API-contract ticket:**
- **Entry point**: a fourth tab in the existing `activeTab` tab strip (`'todos' | 'notes' | 'boards' | 'summary'` in `App.tsx`), styled identically to the other three tabs — not a shortcut/modal, not a docked panel.
- **Layout**: one card per category (color dot + name), each with a compact rollup line (`N actioned · N no-action · N completed`) always visible, expandable/collapsible to reveal the three bucket lists. Categories with zero todos in all three buckets for the week are hidden entirely (see the prototype's `if (total === 0) return null`).
- **Action taken this week**: todo title, then every dated segment for that todo within the week as its own row (date badge + text) — not just the latest.
- **Completed this week**: strikethrough title + a badge showing the completion date; when a prior segment exists before the completion date, it's shown below as an italic "Last update" line (the carry-over hint).
- **No action taken this week**: rendered as a flat wrap of plain pill/chips (title only) rather than a detailed list — deliberately low-emphasis/low-detail, since these are "nothing to report" items.
- **Week navigation**: prev/next arrows plus a "This week" jump button that only appears when the selected week isn't the current one.

Full prototype code (all three variants) is the primary source, kept on branch `prototype/weekly-summary-view` — not merged to main, not folded into production code (this map's destination is a spec, not an implementation; the winning design is captured here in writing for ticket 04 to assemble into spec.md).

