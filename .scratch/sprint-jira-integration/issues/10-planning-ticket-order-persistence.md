# Per-person ticket order: persisted or session-only?

Type: grilling
Status: resolved

## Question

Map is [Sprint (Jira Integration) — Phase 1 Planning Map](../map.md).

The winning Planning view UI (ticket 08, Variant B) lets a team lead drag-reorder a person's planned tickets within their row in the "Tickets by person" table — a way to set that person's work order for the sprint. Decide whether this ordering is:

- Purely a same-session/local UI arrangement (no model change, resets on reload/re-sync) — simplest, but pointless if a TL sets an order expecting it to stick, or
- Persisted per assignee within a team+sprint, requiring a new field (e.g. an `order: number` on `SprintPlanEntry`, since that's the join that already ties a ticket to a specific team+sprint plan) and a save-on-drop mutation.

If persisted, confirm scope:
- Does order matter only within a person's row (so it's scoped per-assignee, not a single global order across the whole plan)?
- Does it need to survive a ticket's assignee changing in Jira (re-sync reassigns it to someone else's row) — does the order value move with it, reset, or go to the end of the new assignee's row?
- Does it need to survive a person leaving/rejoining the team (their `TeamMembership` being removed/re-added)?

Not blocked — the Planning view UI ticket's decision (which variant, and that it has drag-reorderable badges) is settled; this is a narrower follow-up on whether that reordering needs a durable home in the data model from ticket 03.

## Answer

Persisted, not session-only: `SprintPlanEntry` (ticket 03) gains a new field `order: number`. A drag-drop in the Planning view's "Tickets by person" table triggers a save-on-drop mutation that updates `order` for the affected entries in that person's row — a TL who reorders expects it to stick.

Scope and edge cases:

- **Per-assignee, not global.** `order` is only meaningful relative to other `SprintPlanEntry` rows sharing the same assignee within a given team+sprint — it does not define a single ordering across the whole plan. This matches the UI: badges reorder within a person's row only.
- **Assignee reassignment (re-sync moves a ticket to a different person in Jira).** The old `order` value has no meaning in the new assignee's row, so it resets: the reassigned entry is appended to the end of the new assignee's row (e.g. `max(order) + 1` among that assignee's current entries), rather than preserved or inserted at the front.
- **Person leaves/rejoins the team (`TeamMembership` removed/re-added).** `order` is untouched. It's keyed off the ticket's `assigneeAccountId`, not `TeamMembership` — membership changes don't cascade into `SprintPlanEntry` at all. A person's row reappears with its prior order intact if they rejoin, since nothing reset it on the way out.
