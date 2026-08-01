# Weekly Progress Summary — per-category todo activity for a selected week

Status: ready-for-agent

Source: synthesized from the "Weekly Progress Summary" wayfinder map (`.scratch/weekly-summary/map.md` — three resolved tickets: [Weekly-summary compute strategy: on-demand vs precomputed](issues/01-compute-strategy-research.md), [Weekly progress summary: view design & entry point](issues/02-view-and-entry-point-prototype.md), [Weekly summary API request/response contract](issues/03-api-contract.md)).

## Problem Statement

Todos in this app accumulate their history as free-form notes in a rich-text `body` — there's no separate activity log. Nothing today lets the user step back and ask "what actually happened this week, per category?" — which todos got worked on, which were finished, and which have sat untouched. This feature derives that view from data that already exists (notes text + a new completion timestamp) rather than adding a new logging mechanism: for a selected Mon–Sun week, each category's todos are grouped into **completed this week**, **action taken this week** (with every dated note segment from that week shown), and **no action taken this week**.

## Domain rules & parsing algorithm

These were settled while charting the map and apply unchanged to every ticket below — implementers should not re-derive or relitigate them.

**Segment parsing** (walks a todo's `body`, the raw Tiptap JSON — **not** the denormalized `bodyText` plain-text extract from `packages/backend/src/utils/tiptapText.ts`, which discards block/line boundaries the rule below depends on):

- A block node (paragraph, list item, heading, etc.), at **any** nesting level, that contains *only* a `dateBadge` node (`packages/frontend/src/components/dateBadge/DateBadgeNode.tsx` — atomic, inline, with a resolved ISO `date` attribute set once when picked) starts a new **segment** dated at that badge's `date` attribute.
- Text before the first such badge-only line is unassigned/pre-log text — it is never shown in the weekly view.
- A line with a badge *plus* other content does **not** start a segment; the badge is incidental there.
- Two badge-only lines back to back yield an empty (zero-text) segment for the first date.

**Bucketing date source**: a segment's week-membership is determined by its badge's own resolved `date` value, **not** by when the text was typed or edited. Editing old segment text doesn't surface as new activity unless the badge's own date falls in the selected week.

**Bucket definitions** (per todo, per category, per selected week — mutually exclusive, no double-counting):

1. **Completed this week** — `completedAt` (see Data Model below) falls in the selected week. Shown here regardless of whether the todo also had an action segment that week.
2. **Action taken this week** — not in bucket 1, and has ≥1 segment dated in the selected week. Every such segment is shown (date + text), not just the latest.
3. **No action taken this week** — everything else, including todos with no notes at all and brand-new todos created this week. There is deliberately **no separate "new this week" bucket**.

**Scope**: one profile at a time (the currently active profile), all of its categories. Cross-profile aggregation is out of scope (see below).

## Data Model

**`packages/backend/src/models/Todo.ts`** gains one field:

```ts
completedAt: Date | null // default null
```

Set/cleared alongside `completed` in the existing toggle handler (`packages/backend/src/routes/todos.ts:193-223`, `PATCH /:id/toggle`): `completedAt = new Date()` on the false→true transition, `completedAt = null` on true→false. The recurring-todo clone created on completion (`todos.ts:205-217`) gets `completedAt: null` explicitly — only the closed original instance gets the timestamp. Existing todos already sitting at `completed: true` have no `completedAt` on read and simply resolve to Mongoose's schema default (`null`, unknown history) — no migration script is needed (this app has no migration framework, and none is being introduced here); they just won't appear in any "completed this week" bucket until re-toggled.

## Compute strategy

**Compute on-demand, at request time — no persisted derived state, no new indexes, no caching layer.** Add a plain function `computeWeeklySummary(...)` in a new `packages/backend/src/utils/weeklySummary.ts`, following the existing small-pure-utility pattern of `tiptapText.ts` / `profileScope.ts`: given a profile's category ids and a resolved week (`weekStart`/`weekEnd`), it fetches the profile's todos, walks each `body` per the parsing rule above, and buckets per the definitions above.

This was a researched decision, not assumed: an empirical benchmark of the actual walk logic showed ~7 microseconds at current scale (35 todos) and under 0.5ms even at a pessimistic 1000-todos/max-size-notes scenario — 3–4 orders of magnitude below the unavoidable Mongo round-trip, which already runs as an unindexed `COLLSCAN` today for the equivalent `categoryId` query (this codebase has zero custom indexes anywhere; that's the existing convention, not a new risk). A precomputed/cached alternative was rejected: since week navigation is arbitrary and the "completed" bucket depends on `completedAt` (orthogonal to `body`), precomputing could only ever cache the raw segment extraction, never the final per-week bucketing — buying back an already-negligible cost in exchange for real sync-correctness surface (notes-save path, the recurring-clone path, a one-off backfill for existing todos). Full findings, including the benchmark table and MongoDB `explain()` output: `.scratch/weekly-summary/research-compute-strategy.md` on branch `research/weekly-summary-compute-strategy` (not merged — reference only).

## API surface

**`GET /api/todos/weekly-summary?profileId=<id>&date=<YYYY-MM-DD>`** — a new handler in `todosRouter` (`packages/backend/src/routes/todos.ts`), registered alongside `/tags` and `/search` (before any `/:id`-shaped route, per that file's existing convention).

**Request**:
- `profileId` (required) — same `requireProfileId` guard used by every other profile-scoped route in this file. Missing/empty → `400 { error: 'profileId is required' }`.
- `date` (optional) — any `YYYY-MM-DD` calendar day inside the desired week; the backend snaps it to that week's Monday itself (local-time calendar-day arithmetic — parse via `new Date(y, m-1, d)`, never `new Date(dateString)`, mirroring the existing `advanceDueDate` day-shift-bug precedent in this same file). Omitted → defaults to the week containing the server's current date. Malformed → `400 { error: 'date must be a valid YYYY-MM-DD date' }`. **Not required to be a Monday** — the backend owns the snap so that logic exists in exactly one place.

**Response** (`200`):

```jsonc
{
  "weekStart": "2026-07-27", // resolved Monday, ISO YYYY-MM-DD
  "weekEnd": "2026-08-02",   // weekStart + 6 days, ISO YYYY-MM-DD
  "categories": [
    {
      "categoryId": "665f...",
      "completed": [
        {
          "id": "665a...",
          "title": "Renew passport",
          "completedAt": "2026-07-30",
          "lastSegmentBeforeCompletion": { "date": "2026-07-18", "text": "Booked the appointment for next week." } // or null
        }
      ],
      "actioned": [
        {
          "id": "665b...",
          "title": "1:1 notes follow-up with Sam",
          "segments": [
            { "date": "2026-07-27", "text": "Sam wants a written proposal before the next 1:1." },
            { "date": "2026-07-30", "text": "Drafted proposal, waiting on his read-through." }
          ]
        }
      ],
      "noAction": [
        { "id": "665c...", "title": "Renew AWS cert" }
      ]
    }
  ]
}
```

Decisions baked into this shape:

- **Lives on `todosRouter`**, not a dedicated router — one more todo-shaped read alongside `/tags` and `/search`.
- **`categoryId` only in each group, no embedded `{name, color}`** — every profile view already loads `/api/categories`; the frontend joins locally rather than this response re-shipping data the client already has.
- **Categories with all three buckets empty for the week are omitted from `categories[]` entirely** — mirrors the UI's own `if (total === 0) return null` treatment (see UI/UX below), so the frontend doesn't reimplement that check. Category walk order matches `GET /api/categories`'s own `sort({ createdAt: 1 })`.
- **`{ weekStart, weekEnd, categories }` envelope, not a bare array** — the client sends `date`, not a pre-snapped Monday, so it needs the resolved week back to render the header and to drive prev/next (`date = weekStart ± 7`, resent on the next request) and "this week" state (compare against the `weekStart` returned from an initial no-`date` request, cached client-side — no separate `isThisWeek` field).
- **`noAction` entries are `{ id, title }` only** — matches exactly what the UI renders (a bare title pill). `completed`/`actioned` entries likewise carry only the fields their bucket's UI uses, not a full `Todo` object.
- **`actioned[].segments` is pre-filtered to the selected week and sorted ascending by date.** **`completed[]` carries no `segments` list** — only `lastSegmentBeforeCompletion` (the single most-recent segment dated before `completedAt`, across all of the todo's segments regardless of week), since that's the only same-bucket segment data the UI renders.

## UI/UX

**Winner: category-dashboard layout as a 4th top-level tab.** Explored via a UI prototype (`/prototype`, mock data only) with three structurally different variants — (A) category-first expandable cards on a new tab, (B) a compact accordion in a `Ctrl+`-shortcut slide-over panel, (C) a day-first "Weekly Board" with Mon–Sun columns. The user picked **A** after reacting live to all three.

- **Entry point**: a fourth tab in the existing `activeTab` tab strip (`'todos' | 'notes' | 'boards' | 'summary'` in `packages/frontend/src/App.tsx`), styled identically to the other three tabs — not a shortcut/modal, not a docked panel.
- **Layout**: one card per category (color dot + name), each with a compact rollup line (`N actioned · N no-action · N completed`, derived client-side from the response arrays' lengths — no separate count fields needed) always visible, expandable/collapsible to reveal the three bucket lists. Categories with zero todos in all three buckets for the week are hidden entirely.
- **Action taken this week**: todo title, then every dated segment for that todo within the week as its own row (date badge + text) — not just the latest.
- **Completed this week**: strikethrough title + a badge showing the completion date; when a prior segment exists before the completion date (`lastSegmentBeforeCompletion`), it's shown below as an italic "Last update" line (the carry-over hint).
- **No action taken this week**: rendered as a flat wrap of plain pill/chips (title only) rather than a detailed list — deliberately low-emphasis, since these are "nothing to report" items.
- **Week navigation**: prev/next arrows plus a "This week" jump button that only appears when the selected week isn't the current one.

Full prototype code (all three compared variants) is the primary source for this section, kept on branch `prototype/weekly-summary-view` (not merged to `main`, not folded into production code) — `packages/frontend/src/weekly-summary-prototype/`.

## Out of scope

- **Cross-week trend/analytics views** (e.g. a velocity chart across many weeks) — this feature is a single-week-at-a-time view with prev/next navigation between individual weeks, not aggregate multi-week analytics.
- **Cross-profile summary view** — scope is one active profile at a time, matching how the rest of the app (categories, boards) is profile-scoped.

## Further notes / deferred ideas

Not decided against, just not sharp enough yet to spec — left as candidates for a future follow-up once this view exists and gets used:

- **Stuck/stalled indicator**: flagging todos in "no action taken this week" that also had no action in prior week(s), to distinguish "just started" from "genuinely stalled." Deferred by the user pending a look at the shipped view.
- Any further insight angles that emerge once the view is in daily use.

## Primary sources

- Compute-strategy research (benchmark + `explain()` output): `.scratch/weekly-summary/research-compute-strategy.md` on branch `research/weekly-summary-compute-strategy`.
- View design & entry-point prototype (three compared variants): branch `prototype/weekly-summary-view`, `packages/frontend/src/weekly-summary-prototype/`.
- Full decision map: `.scratch/weekly-summary/map.md`.
