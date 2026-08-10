# Team & person management flow

Type: grilling
Status: resolved
Blocked by: 01, 02

## Question

Map is [Sprint (Jira Integration) — Phase 1 Planning Map](../map.md).

Design how teams and their people get set up in phase 1:

- **Team creation**: is there a UI for creating a `Team` and configuring its scoping label(s), or is phase 1's single/first team seeded directly (e.g. a script or a minimal admin form)? Weigh against the map's "multi-team capable" requirement — creating a second team later should not require code changes.
- **Person mapping**: how a Jira person gets mapped to an app `Person` (full name + email). Depends on ticket 01's findings on whether Jira exposes a user-search API — if so, prefer looking up/confirming against real Jira users; if not, decide on manual entry (name + email, optionally Jira `accountId`).
- **Team membership editing**: the UI/flow for adding a person to a team, setting their role, and setting/overriding their capacity percentage (per ticket 02's model).
- **Label configuration**: how a team's scoping label(s) get set and changed, and what happens to already-cached tickets if a team's label mapping changes later.

Blocked by ticket 01 (Jira user-lookup capability) and ticket 02 (the Team/Person/Membership shape this flow manages). Informs, but does not block, ticket 08.

## Answer

**Fact-check first**: ticket 01 never actually researched whether Jira exposes a user-search API — that sub-question was asked but not covered by its original scope. Confirmed via live web search: `GET /rest/api/3/user/search?query=` exists (matches `displayName`/`emailAddress` prefix), but requires the **"Browse users and groups"** global permission — separate from the "Browse projects" permission ticket 01 confirmed as sufficient for read-only ticket access. Whether the personal API token's account actually has this permission is unverified — added to ticket 01's existing "needs live verification" list.

**Team creation.** A "Manage teams" panel, directly modeled on `ProfileSwitcher.tsx`'s existing "Manage profiles" panel (gear-icon trigger, create/rename/delete, inline editing) — reachable from the new `TeamSwitcher` (see the routing ticket). Fields: `name` and `jiraLabels` (phase 1: single label). Rejected seeding team #1 via script/hand-written doc, since the map already commits to "multi-team capable" as a phase-1 requirement, and a seed-only path would make team #2+ require code changes.

**Person mapping** — two paths, primary avoiding the permission risk entirely:
- **Primary — promote an unmapped assignee**: wherever unmapped assignees already surface (Planning/Status views), a one-click "Add as Person" pre-fills from that ticket's already-cached assignee data (`assigneeAccountId`, `displayName`, `emailAddress` — see ticket 03's `Ticket` schema) and creates the `Person` (+ optionally the `TeamMembership` in the same flow). Zero new Jira API calls, zero exposure to the `user/search` permission gap.
- **Secondary — manual entry**: a plain "Add person" form (name, email, `jiraAccountId`) for someone with no synced tickets yet. If `user/search` is confirmed working for this token during implementation, wire it as autocomplete on this form (type name/email, pick the match, `accountId` fills automatically); if not, fall back to plain manual fields — not a phase-1 blocker since the promote-from-unmapped-assignee path covers the common case.

**Team membership editing.** A per-team roster sub-view inside the "Manage teams" panel — select a team, see its `TeamMembership` rows (person, role, effective capacity %), same list-with-inline-actions pattern as `ProfileSwitcher`'s manage panel:
- **Add**: pick an existing `Person` (autocomplete over all People, not team-scoped) or create one via the manual-entry form above, then set role (`<select>` over the `Role` union) and capacity (defaults to role default, optional override input) in the same step.
- **Edit**: role and capacity edited inline on the roster row (no separate modal) — capacity input shows the role-default as a placeholder when `capacityPercentOverride` is `null`, and clearing it reverts to `null`.
- **Remove**: deletes the `TeamMembership` only (same lightweight confirm pattern as profile delete); the `Person` itself persists, since they may belong to other teams.

**Label configuration.** Setting/changing a team's `jiraLabels` is just an inline-edited field on the "Manage teams" panel (Q1) — no separate flow. Changing it needs **no cache invalidation, backfill, or re-sync**: a ticket's team membership (for Status-view auto-discovery and the unmapped-assignee bucket) is never stored — it's computed live by matching `Ticket.labels` against `Team.jiraLabels` at query/render time, the same "compute, don't store" pattern already used for unmapped-assignee and rollups (tickets 02/03). The one persisted exception is `SprintPlanEntry` (a ticket deliberately added to a team+sprint's plan, per ADR 0002) — those rows are untouched by a later label change, so an already-planned ticket keeps appearing in that sprint's plan even if it would no longer match the team under the new label.
