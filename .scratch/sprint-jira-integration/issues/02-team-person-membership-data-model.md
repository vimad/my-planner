# Team, Person & Team-Membership data model

Type: grilling
Status: resolved

## Question

Map is [Sprint (Jira Integration) — Phase 1 Planning Map](../map.md).

Pin down the data model for `Team`, `Person`, and the membership relationship between them, independent of the existing `Profile` model:

- `Team`: what fields does it need beyond a name (e.g. the Jira label(s) that scope it, since one team maps to one label but the shared backlog means a ticket can carry several teams' labels)?
- `Person`: confirmed as full name + email on the app side — does it also need a Jira `accountId` stored (for matching assignees precisely, since names/emails can collide or change) or is name+email matching sufficient?
- `Role`: the set of roles seen in the capacity sheet (TL, ATL, SSE, SE, SQA, QA, Intern, etc.) — is this a fixed enum, or a small admin-editable list? Each role has a **default capacity percentage**.
- `TeamMembership` (Team × Person): carries the person's role on that team and their **effective capacity percentage** for that team — defaulted from the role, but overridable per member. Decide the exact override mechanism (explicit override field vs. null-falls-back-to-role-default) and whether a person can belong to more than one team simultaneously (phase 1 just needs the model to not preclude it, per the map's "cross-team capacity rollup" fog note).
- Decide whether "unmapped assignee" (a ticket carrying the team's label whose Jira assignee isn't a known team member) needs a first-class model entry or is purely a display-time computation against `TeamMembership`.

This ticket is unblocked and can start immediately; ticket 04 (capacity formula), 06 (navigation/routing), 07 (team/person management flow), and 08 (Planning view UI) depend on its outcome.

## Answer

Converged on the following schema (Mongoose/MongoDB, matching this repo's flat one-file-per-model house style):

**Team**
- `name: string` (required)
- `jiraLabels: string[]` (required — array for future flexibility; exactly one entry per team today)

**Person**
- `name: string`, `email: string` (display/contact only — not the match key)
- `jiraAccountId: string` (required, unique — the actual key used to match Jira ticket assignees; see [ADR 0001](../../../docs/adr/0001-match-jira-assignees-by-account-id.md))

**Role** — a fixed TypeScript union, not a DB collection: `'TL' | 'ATL' | 'SSE' | 'SE' | 'SQA' | 'QA' | 'Intern'`. Each value maps to a hardcoded default capacity percentage via a constant lookup (e.g. `ROLE_DEFAULT_CAPACITY_PERCENT: Record<Role, number>`).

**TeamMembership** (join: Team × Person)
- `teamId: ObjectId ref Team` (required), `personId: ObjectId ref Person` (required) — unique compound index on `(teamId, personId)`; a Person may hold separate `TeamMembership` documents in more than one Team.
- `role: Role` (required)
- `capacityPercentOverride: number | null` (default `null`) — effective capacity % = `capacityPercentOverride ?? ROLE_DEFAULT_CAPACITY_PERCENT[role]`.

**Unmapped assignee** — not modeled as data at all. Purely a display-time comparison: a cached ticket's assignee `jiraAccountId` (see ticket 03) against the selected team's current `TeamMembership` list. No persisted field, no backfill needed if a `Person` is added later.

Recorded in [CONTEXT.md](../../../CONTEXT.md) (Team, Person, Role, Team Membership, Effective capacity percentage, Unmapped assignee) and [ADR 0001](../../../docs/adr/0001-match-jira-assignees-by-account-id.md) (accountId as match key — hard to reverse, non-obvious given email would seem simpler).
