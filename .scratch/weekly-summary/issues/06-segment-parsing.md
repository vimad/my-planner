# 06 — Segment-parsing algorithm (body → dated segments)

**What to build:** The system can extract a chronological list of dated activity segments from any todo's notes body — the raw material every later bucketing/summary ticket reads from.

**Blocked by:** None — can start immediately

**Status:** done

- [x] A pure function walks a todo's raw Tiptap `body` JSON (not the denormalized `bodyText` plain-text extract, which discards the line boundaries this rule depends on) and returns a list of segments: `{ date, text }`
- [x] A block node (paragraph, list item, heading, etc.) containing *only* a `dateBadge` node, at any nesting level, starts a new segment dated at that badge's resolved ISO `date` attribute
- [x] Text before the first such badge-only line is excluded (unassigned/pre-log text, never returned as a segment)
- [x] A line with a badge *plus* other content does not start a new segment — the badge is incidental
- [x] Two consecutive badge-only lines yield an empty-text segment for the first date
- [x] The rule applies uniformly across block node types and nesting levels, not just top-level paragraphs
- [x] A null/empty `body` returns an empty segment list
- [x] Unit tests cover every rule and edge case above, using constructed Tiptap JSON fixtures

## Result

Implemented as `parseWeeklySummarySegments` in `packages/backend/src/utils/weeklySummarySegments.ts`, tested in `packages/backend/test/weeklySummarySegments.test.ts` (10 tests).
