# Plan/Spill is sprint-scoped on SprintPlanEntry, not a global per-ticket override

[ADR 0004](0004-dev-qa-override-wins-over-jira-resync.md) and [ADR 0005](0005-assignee-override-wins-over-jira-resync.md) both store their override in its own global, per-ticket collection (`TicketDevQaOverride`, `TicketAssigneeOverride`) — deliberately decoupled from `Ticket` so a Jira resync never touches it, and deliberately *global* (not scoped to a team+sprint) so the pick, once made, keeps winning over Jira for that ticket everywhere it appears.

Plan/Spill (spec `.scratch/sprint-plan-spill-estimate/spec.md`) looks superficially similar — another Planning-only annotation a resync must never clobber — but is a different kind of decision, and lives on `SprintPlanEntry` (sprint-scoped, one document per team+sprint+ticket per [ADR 0002](0002-separate-sprint-plan-entry-from-ticket.md)) instead:

- A Dev/QA Override or Assignee Override answers "who does Jira not tell us correctly" — a correction to a fact Jira gets wrong (or doesn't supply), which stays wrong the same way every time the ticket comes up. It has no natural expiry.
- Plan/Spill answers "how much of this ticket's estimate are we actually counting *this sprint*" — a planning decision scoped to one sprint's capacity math. The same ticket carried into a later sprint (a new `SprintPlanEntry` for the same ticket, per ADR 0002) is a fresh planning decision with no relationship to whatever was spilled or buffered last time.

If Plan/Spill lived in a global per-ticket collection the way the two Overrides do, a ticket that spills out of Sprint 41 and gets picked back up in Sprint 42 would carry its Sprint 41 Spill forward by default — silently zeroing out Sprint 42's Planned figure for a ticket nobody has spilled *this* time. Sprint-scoping avoids that by construction: a new `SprintPlanEntry` starts with all six Plan/Spill fields `null` ("follow Original"), the same way every other per-sprint figure on that model does.

## Consequence

`routes/sprintPlanEntries.ts`'s `PATCH /:id` (not a new global-override route) is the only write path — the six fields live directly on the `SprintPlanEntry` schema rather than in a sibling collection, and there is no cross-sprint carry-forward to implement or reason about.
