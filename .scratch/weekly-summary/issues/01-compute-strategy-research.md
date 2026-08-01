# Weekly-summary compute strategy: on-demand vs precomputed

Type: research
Status: resolved

Findings: `.scratch/weekly-summary/research-compute-strategy.md` on branch `research/weekly-summary-compute-strategy` (throwaway branch, not merged).

## Question

For the weekly progress summary (see map.md Destination and Notes), should the backend compute the parsing/bucketing **on-demand at request time** (fetch all todos for the profile's categories, walk each `body` JSON in memory, bucket into the week), or should it maintain some **precomputed/denormalized/cached** representation kept in sync as notes are edited?

Investigate and recommend, considering:

- Real scale: 35 todos / 6 categories / 3 profiles today, avg notes body ~387 bytes (max ~2.2KB) — a personal single-user app with a low growth ceiling (see map.md Notes for how this was measured).
- Cost of walking Tiptap JSON for every todo in a profile on every request: rough complexity/latency estimate at current and 10x-20x scale.
- MongoDB query shape: can `Todo.find({ categoryId: { $in: [...] } })` alone supply everything needed, or does bucketing require additional indexes/fields (e.g. an index on `completedAt`)?
- Maintainability cost of a precomputed approach: what would need to stay in sync (on notes save, on toggle, on category/profile changes), and where that sync logic would live — versus the simplicity of a pure on-demand function with no sync surface at all.
- Whether there's a middle ground worth naming (e.g. computing on-demand but caching the response in memory/HTTP-cache for the lifetime of a request burst) — and whether it's worth the complexity here.

Give a clear recommendation: on-demand, precomputed, or a specific middle ground — and why, in terms of both performance and maintainability at this app's actual scale.

## Answer

**Compute on-demand, at request time, with zero persisted derived state.** No new schema fields beyond the already-decided `completedAt`, no new indexes, no caching layer.

- **Performance**: an empirical benchmark of this repo's actual walk logic (Node v24.11.1) shows walking every todo's Tiptap `body` costs ~7 microseconds at current scale (35 todos) and stays under 0.5ms even at a pessimistic 1000-todos-all-max-size-notes scenario — 3-4 orders of magnitude below the unavoidable Mongo round-trip, which itself already runs as an unindexed `COLLSCAN` today for the equivalent `categoryId` query (confirmed live via `explain()` against the dev DB; this codebase has zero custom indexes anywhere, so a `COLLSCAN` here is the existing convention, not a new risk). MongoDB's own docs give no small-collection threshold that would change this.
- **Maintainability**: because week navigation is arbitrary and "completed this week" depends on `completedAt` (orthogonal to `body`), a precomputed design could only ever cache the raw body→segments extraction — never the final per-week bucketing/rollup, which must run on every request regardless. So precomputing would only buy back the already-negligible walk time, in exchange for real sync-correctness surface across notes-save, the recurring-todo clone path (`todos.ts:206-217`, easy to forget), and a one-off backfill for the 35 existing todos (this app has no migration framework).
- **Middle ground rejected**: per-request caching has nothing to deduplicate (each body is walked once per request); cross-request memoization is a new stateful failure mode (unbounded cache growth, eviction policy) this otherwise-stateless backend doesn't have, to save a sub-millisecond computation.

**Concretely**: add a plain function `computeWeeklySummary(profileId, weekStart)` in a new `packages/backend/src/utils/weeklySummary.ts`, following the existing small-pure-utility pattern of `tiptapText.ts`/`profileScope.ts`.

Full findings, including the benchmark table and MongoDB `explain()` output: `.scratch/weekly-summary/research-compute-strategy.md` on branch `research/weekly-summary-compute-strategy`.

