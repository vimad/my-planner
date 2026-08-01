# Weekly Progress Summary — map

## Destination

A written spec for a **weekly, per-category todo progress summary**: derives dated "activity segments" from each todo's notes body (text between one date-badge-only line and the next), and for a selected Mon–Sun week, groups each category's todos into *action taken this week* (date + detail), *no action taken this week*, and *completed this week* (via a new `completedAt` field) — covering the parsing algorithm, backend compute/storage strategy (and its performance/maintainability tradeoffs), the API shape, and the UI/navigation design. Ready to hand to a separate implementation effort.

## Notes

**Relevant code:**
- `packages/backend/src/models/Todo.ts` — `TodoDoc`/schema; `completedAt` is a new field to add here.
- `packages/frontend/src/components/dateBadge/DateBadgeNode.tsx` — the `dateBadge` Tiptap node: atomic, inline, with a resolved ISO `date` attribute set once when picked (display labels like "Today"/"Tomorrow" are computed from it via `formatBadgeLabel`, not stored literally).
- `packages/backend/src/utils/tiptapText.ts` — `tiptapToPlainText` flattens `body` into the denormalized `bodyText` search extract by joining all text with spaces. **Not usable for the weekly-summary parser** — it discards block/line boundaries, which the "date-badge-alone-on-a-line" rule depends on. The parser must walk `body` (raw Tiptap JSON) directly.
- `packages/backend/src/models/Category.ts` — every category has a `profileId`; the weekly summary is scoped to the current profile's categories.
- `packages/backend/src/routes/todos.ts:193-223` — `PATCH /:id/toggle`, where `completedAt` gets set/cleared, and where the recurring-todo clone is created.
- `packages/frontend/src/App.tsx` — existing `activeTab` pattern (`'todos' | 'notes' | 'boards'`) and the `Ctrl+A` → `BoardSwitcherModal` shortcut/modal pattern (`components/BoardSwitcherModal.tsx`) — prior art for the toggle/entry-point design.

**Real data scale** (checked directly against the dev DB): 35 todos, 6 categories, 3 profiles, average notes body ~387 bytes (max ~2.2KB). Personal single-user app — growth ceiling is low thousands of todos at most.

**Settled domain rules** (resolved during charting; every ticket must respect these, not re-litigate them):

- **`completedAt`**: new `Todo` field. Set when `PATCH /:id/toggle` flips `completed` false→true; cleared when it flips true→false. The recurring-todo clone created on completion (`todos.ts:205-217`) gets `completedAt: null` — only the closed original gets the timestamp. Existing already-`completed: true` todos backfill to `null` (unknown history) — they simply won't appear in any "completed this week" bucket until re-toggled.
- **Parsing rule**: a block node (paragraph, list item, heading, etc.) containing *only* a `dateBadge` node starts a new segment dated at that badge's `date` attribute. Text before the first such line is unassigned/pre-log text — never shown in the weekly view. A line with a badge *plus* other content does not start a segment (badge is incidental). Two badge-only lines back to back yield an empty (zero-text) segment for the first date. The rule applies at any block-node level, not just top-level paragraphs.
- **Bucketing date source**: a segment's week-membership is determined by its badge's own resolved `date` value, **not** by when the text was typed/edited. Editing old segment text doesn't surface as new activity unless the badge's date itself falls in the selected week.
- **Bucket definitions** (per todo, per category, per selected week — mutually exclusive, no double-counting):
  1. **Completed this week** — `completedAt` falls in the selected week. Shown here regardless of whether it also had an action segment that week.
  2. **Action taken this week** — not in bucket 1, and has ≥1 segment dated in the selected week. Shows every such segment (date + text), not just the latest.
  3. **No action taken this week** — everything else, including todos with no notes at all and brand-new todos created this week. There is deliberately **no separate "new this week" bucket**.
- **Scope**: one profile at a time (the currently active profile), all of its categories.

**Insight ideas folded into destination** (to be shaped via the prototype ticket, not designed further here):
2. Category rollup counts (e.g. "3 actioned · 5 no-action · 2 completed") above the detail lists.
3. Week navigation — prev/next-week and "jump to this week", not just a single isolated week.
4. Show every dated segment for a todo within the week, not just the latest, when a todo has multiple.
5. "Completed this week" items optionally show their last action segment before completion.

Skills to use while resolving tickets: `/research` (research tickets), `/prototype` (prototype ticket), `/grilling` + `/domain-modeling` (the API-contract ticket and any ambiguity).

## Decisions so far

- [Weekly-summary compute strategy: on-demand vs precomputed](issues/01-compute-strategy-research.md) — compute on-demand at request time, zero persisted derived state, no new indexes. The walk costs microseconds to sub-millisecond even at 20x scale (empirically benchmarked), dwarfed by the already-unindexed `COLLSCAN` this app's queries already run today; precomputing couldn't even skip the per-request rollup (week navigation is arbitrary) and would add real sync surface for negligible savings. Full findings: `.scratch/weekly-summary/research-compute-strategy.md` on branch `research/weekly-summary-compute-strategy`.

## Not yet specified

- **Stuck/stalled indicator** (idea 1 from charting): flagging todos in "no action taken this week" that also had no action in prior week(s), to distinguish "just started" from "genuinely stalled." Explicitly deferred by the user pending a look at the prototype — revisit once the core view has shape.
- Any further insight angles that emerge once the prototype is in hand ("prototypes might give me more clarity when I see those features" — user's words).

## Out of scope

- **Cross-week trend/analytics views** (e.g. a velocity chart across many weeks) — the destination is a single-week-at-a-time view with prev/next navigation between individual weeks, not aggregate multi-week analytics. Not ruled out forever, just beyond this destination.
- **Cross-profile summary view** — scope is one active profile at a time, matching how the rest of the app (categories, boards) is profile-scoped.
