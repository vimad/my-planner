# 08 — `GET /api/todos/weekly-summary` endpoint

**What to build:** A client can request a profile's weekly progress summary for any week and get back exactly the categories, buckets, and segments it needs to render — nothing more.

**Blocked by:** 07 — Weekly bucketing (`computeWeeklySummary`)

**Status:** ready-for-agent

- [ ] New route on `todosRouter`, registered before any `/:id`-shaped route (alongside `/tags` and `/search`)
- [ ] `profileId` required; missing/empty → `400 { error: 'profileId is required' }`
- [ ] Optional `date=YYYY-MM-DD`; backend snaps it to that week's Monday using local calendar-day arithmetic (never `new Date(dateString)`); omitted → defaults to the week containing the server's current date
- [ ] Malformed `date` → `400 { error: 'date must be a valid YYYY-MM-DD date' }`
- [ ] Response is `{ weekStart, weekEnd, categories }` matching the spec's example shape exactly
- [ ] Each category group is keyed by bare `categoryId` only — no embedded `name`/`color`
- [ ] Categories with all three buckets empty for the week are omitted from `categories[]` entirely
- [ ] Category walk order matches `GET /api/categories`'s own `sort({ createdAt: 1 })`
- [ ] `noAction` entries are `{ id, title }` only; `actioned` entries carry `segments` pre-filtered to the week and sorted ascending by date; `completed` entries carry `completedAt` + `lastSegmentBeforeCompletion`, no `segments` list
- [ ] Integration tests (supertest) cover the full contract: `profileId` validation, `date` snapping/validation/default, response shape, and empty-category omission
