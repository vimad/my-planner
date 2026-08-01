# 07 — Weekly bucketing (`computeWeeklySummary`)

**What to build:** Given a profile and a selected week, the system can classify every todo in every one of that profile's categories into completed / action-taken / no-action for that week.

**Blocked by:** 05 — Add `completedAt` to Todo + wire into toggle route, 06 — Segment-parsing algorithm (body → dated segments)

**Status:** done

- [x] A pure `computeWeeklySummary`-style function takes a profile's category ids plus a resolved week (`weekStart`/`weekEnd`) and returns per-category bucket results
- [x] A todo whose `completedAt` falls in the selected week goes in **completed**, regardless of whether it also has a segment dated that week
- [x] A todo not in the completed bucket, with ≥1 segment dated in the selected week, goes in **actioned** — every such segment is attached, not just the latest
- [x] Everything else (no notes at all, brand-new todos, segments only outside the week) goes in **no action** — there is deliberately no separate "new this week" bucket
- [x] Each **completed** entry exposes the single most-recent segment dated before its `completedAt` (searched across all of that todo's segments, any week), or `null` if none exists
- [x] Bucketing is mutually exclusive per todo — no todo appears in more than one bucket
- [x] Unit tests cover each bucket, multi-segment todos, zero-segment todos, and both the completed-with-a-prior-segment and completed-with-no-prior-segment cases

## Result

Implemented as `computeWeeklySummaryBuckets` (returns `WeeklySummaryCategoryGroup[]`) in `packages/backend/src/utils/weeklySummaryBuckets.ts`, tested in `packages/backend/test/weeklySummaryBuckets.test.ts` (12 tests). Named `computeWeeklySummaryBuckets` rather than `computeWeeklySummary` to distinguish this pure bucketer from the route layer (ticket 08), which owns the Mongo fetch.
