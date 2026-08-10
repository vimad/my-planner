# Per-person ticket order: persisted or session-only?

Type: grilling
Status: open

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
