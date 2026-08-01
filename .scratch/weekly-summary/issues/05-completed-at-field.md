# 05 — Add `completedAt` to Todo + wire into toggle route

**What to build:** Completing a todo records *when* it happened, distinct from just flipping `completed: true`; reopening it clears that record. This is the timestamp every later weekly-summary ticket buckets against.

**Blocked by:** None — can start immediately

**Status:** ready-for-agent

- [ ] `Todo` schema gains `completedAt: Date | null`, defaulting to `null`
- [ ] `PATCH /api/todos/:id/toggle` sets `completedAt` to the current time on the `false` → `true` transition
- [ ] `PATCH /api/todos/:id/toggle` clears `completedAt` back to `null` on the `true` → `false` transition
- [ ] The recurring-todo clone created on completion gets `completedAt: null` explicitly — only the closed original instance gets the timestamp
- [ ] Existing todos with no `completedAt` in the database resolve to `null` on read (Mongoose schema default) — no migration script needed
- [ ] Tests cover both transitions and the recurring-clone case
