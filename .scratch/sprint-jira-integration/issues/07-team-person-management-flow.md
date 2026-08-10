# Team & person management flow

Type: grilling
Status: open
Blocked by: 01, 02

## Question

Map is [Sprint (Jira Integration) — Phase 1 Planning Map](../map.md).

Design how teams and their people get set up in phase 1:

- **Team creation**: is there a UI for creating a `Team` and configuring its scoping label(s), or is phase 1's single/first team seeded directly (e.g. a script or a minimal admin form)? Weigh against the map's "multi-team capable" requirement — creating a second team later should not require code changes.
- **Person mapping**: how a Jira person gets mapped to an app `Person` (full name + email). Depends on ticket 01's findings on whether Jira exposes a user-search API — if so, prefer looking up/confirming against real Jira users; if not, decide on manual entry (name + email, optionally Jira `accountId`).
- **Team membership editing**: the UI/flow for adding a person to a team, setting their role, and setting/overriding their capacity percentage (per ticket 02's model).
- **Label configuration**: how a team's scoping label(s) get set and changed, and what happens to already-cached tickets if a team's label mapping changes later.

Blocked by ticket 01 (Jira user-lookup capability) and ticket 02 (the Team/Person/Membership shape this flow manages). Informs, but does not block, ticket 08.
