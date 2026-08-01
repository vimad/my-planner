# Weekly progress summary: view design & entry point

Type: prototype
Status: claimed

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

