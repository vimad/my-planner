# Weekly summary API request/response contract

Type: grilling
Status: resolved

Blocked by: 01, 02

## Question

Define the concrete API contract for the weekly summary endpoint: request shape (profile scoping, week selection — e.g. a Monday `dueDate`-style ISO string, or year+week-number?), response shape (per-category rollup counts, per-bucket todo lists, per-todo segment lists with date+text, the completed-item carry-over hint if kept), and where this endpoint lives relative to the existing `todosRouter` (`packages/backend/src/routes/todos.ts`).

This depends on:
- The compute-strategy decision (Weekly-summary compute strategy: on-demand vs precomputed) — whether the response is assembled fresh per request or read from a precomputed store shapes what the endpoint can cheaply return.
- The prototype (Weekly progress summary: view design & entry point) — the UI's actual data needs (rollup counts, multi-segment lists, carry-over hints, week-navigation affordances) drive what the response must contain.

## Answer

**Endpoint**: `GET /api/todos/weekly-summary?profileId=<id>&date=<YYYY-MM-DD>` — a new handler in `todosRouter` (`packages/backend/src/routes/todos.ts`), registered alongside `/tags` and `/search` (before any `/:id`-shaped route, per the existing convention there). Not a separate router — it's a todo-shaped read, same as those two.

**Request**:
- `profileId` (required) — same `requireProfileId` guard used by every other profile-scoped route in this file. Missing/empty → `400 { error: 'profileId is required' }`.
- `date` (optional) — any `YYYY-MM-DD` calendar day inside the desired week; the backend snaps it to that week's Monday itself (reusing the prototype's local-date `mondayOf` logic, ported server-side — parse via `new Date(y, m-1, d)` local time, never `new Date(dateString)`, per the existing `advanceDueDate` day-shift-bug precedent in this same file). Omitted → defaults to the week containing the server's current date. Malformed (fails to parse as a calendar date) → `400 { error: 'date must be a valid YYYY-MM-DD date' }`. **Not required to be a Monday** — that's the point of accepting `date` over `weekStart`.
- No day-of-week validation beyond "parses as a real date" — `2026-02-30` etc. rejected the same way `advanceDueDate` would choke on it (left as today's existing behavior, not hardened further here).

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

Decisions baked into this shape (resolved via grilling, in order):

1. **Lives on `todosRouter`**, not a dedicated `weeklySummary.ts` router — treated as one more todo-shaped read alongside `/tags` and `/search`, not a big enough cross-cutting concern to warrant its own file.
2. **`date`, not `weekStart`/ISO-week-number** — client sends any day in the target week (e.g. echoing back a `weekStart` it already has, or a fresh `today` on first load); backend owns the Monday-snap so that logic exists in exactly one place, not duplicated client- and server-side.
3. **`categoryId` only, no embedded `{name, color}`** — every profile view already loads `/api/categories`; the frontend joins locally. Keeps this response from re-shipping data the client already has.
4. **Categories with all three buckets empty for the week are omitted from `categories[]` entirely** — mirrors the prototype's `if (total === 0) return null` exactly, so the frontend doesn't reimplement that check. Category walk order matches `GET /api/categories`'s own `sort({ createdAt: 1 })`.
5. **`{ weekStart, weekEnd, categories }` envelope, not a bare array** — since the client no longer computes the Monday-snap itself (decision 2), it needs the resolved week back to render the header and to drive prev/next (`date = weekStart ± 7`, resent on the next request) and the "this week" state (compare against the `weekStart` returned from an initial no-`date` request, cached client-side — no separate `isThisWeek` field needed).
6. **`noAction` entries are `{ id, title }` only** — matches exactly what Variant A renders (a bare title pill); no dueDate/priority/etc. carried along unused. `completed`/`actioned` entries likewise carry only the fields their bucket's UI uses — no full `Todo` object in any bucket.
7. **`actioned[].segments` is pre-filtered to the selected week and sorted ascending by date** (not "every segment this todo has, any week" — that was the prototype's mock-data convenience for driving all three variants off one dataset, not something a per-week endpoint needs to return). **`completed[]` does not carry a `segments` list at all** — only `lastSegmentBeforeCompletion` (the single most-recent segment dated before `completedAt`, across all of the todo's segments regardless of week — same lookup the prototype's `computeWeekSummary` does), since that's the only same-bucket segment data Variant A renders.

Bucketing/parsing itself (walking `body`, deriving segments, applying the three bucket definitions) is the map's already-settled "Settled domain rules" — this ticket only fixes how that computed result crosses the wire.
