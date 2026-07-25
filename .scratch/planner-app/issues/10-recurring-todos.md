# 10 — Recurring todos

**What to build:** A user can set a todo to recur Daily, Weekly, or Monthly. Completing it creates the next instance automatically — copied from the current one, with its due date advanced by the interval — and the user can turn recurrence off on an instance to stop the series.

**Blocked by:** 08 — Todo detail: priority, due date, tags, category, rich-text body

**Status:** ready-for-agent

- [ ] Todo model/routes extended with a `recurrence` field: `{ pattern: 'daily' | 'weekly' | 'monthly' }` or `null`
- [ ] Completing a todo with non-null `recurrence` creates a new Todo cloned from it (same category, priority, tags, body, recurrence), `completed: false`, with `dueDate` advanced by the pattern's interval (daily +1 day, weekly +7 days, monthly same day next month) from the completed instance's due date — per [Recurring Todo Behavior](../issues/04-recurring-todo-behavior.md)
- [ ] The completed instance itself is left untouched (stays completed, keeps its own recurrence value) — the newly created instance is what continues the series
- [ ] The todo edit view lets the user set/change recurrence to Daily/Weekly/Monthly or turn it off
- [ ] Turning recurrence off on the current open instance stops further instances from being created; there is no separate "series" entity
- [ ] Recurring todo instances count toward category remaining/completed totals exactly like any other todo — no special-casing
- [ ] Backend recurrence-advance logic is tested via `createApp()` + supertest (completing a recurring todo asserts the next instance's fields and advanced due date)
- [ ] Frontend recurrence picker and stop-recurrence toggle are tested via React Testing Library
