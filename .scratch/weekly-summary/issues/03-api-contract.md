# Weekly summary API request/response contract

Type: grilling
Status: open

Blocked by: 01, 02

## Question

Define the concrete API contract for the weekly summary endpoint: request shape (profile scoping, week selection — e.g. a Monday `dueDate`-style ISO string, or year+week-number?), response shape (per-category rollup counts, per-bucket todo lists, per-todo segment lists with date+text, the completed-item carry-over hint if kept), and where this endpoint lives relative to the existing `todosRouter` (`packages/backend/src/routes/todos.ts`).

This depends on:
- The compute-strategy decision (Weekly-summary compute strategy: on-demand vs precomputed) — whether the response is assembled fresh per request or read from a precomputed store shapes what the endpoint can cheaply return.
- The prototype (Weekly progress summary: view design & entry point) — the UI's actual data needs (rollup counts, multi-segment lists, carry-over hints, week-navigation affordances) drive what the response must contain.

## Answer

