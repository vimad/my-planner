# 08 — `GET /api/todos/weekly-summary` endpoint

**What to build:** A client can request a profile's weekly progress summary for any week and get back exactly the categories, buckets, and segments it needs to render — nothing more.

**Blocked by:** 07 — Weekly bucketing (`computeWeeklySummary`)

**Status:** done

- [x] New route on `todosRouter`, registered before any `/:id`-shaped route (alongside `/tags` and `/search`)
- [x] `profileId` required; missing/empty → `400 { error: 'profileId is required' }`
- [x] Optional `date=YYYY-MM-DD`; backend snaps it to that week's Monday using local calendar-day arithmetic (never `new Date(dateString)`); omitted → defaults to the week containing the server's current date
- [x] Malformed `date` → `400 { error: 'date must be a valid YYYY-MM-DD date' }`
- [x] Response is `{ weekStart, weekEnd, categories }` matching the spec's example shape exactly
- [x] Each category group is keyed by bare `categoryId` only — no embedded `name`/`color`
- [x] Categories with all three buckets empty for the week are omitted from `categories[]` entirely
- [x] Category walk order matches `GET /api/categories`'s own `sort({ createdAt: 1 })`
- [x] `noAction` entries are `{ id, title }` only; `actioned` entries carry `segments` pre-filtered to the week and sorted ascending by date; `completed` entries carry `completedAt` + `lastSegmentBeforeCompletion`, no `segments` list
- [x] Integration tests (supertest) cover the full contract: `profileId` validation, `date` snapping/validation/default, response shape, and empty-category omission

## Result

Implemented in `packages/backend/src/routes/todos.ts` (`GET /weekly-summary`), tested in `packages/backend/test/todos.route.test.ts` (8 new tests). Local calendar-day helpers (`parseLocalDate`/`toLocalDateString`/`addDays`/`mondayOf`) were later extracted to a shared `packages/backend/src/utils/localDate.ts` (also used by `weeklySummaryBuckets.ts`) during code review, to remove duplication between this route and the bucketer.
