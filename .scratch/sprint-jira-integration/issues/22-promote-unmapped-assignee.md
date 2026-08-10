# 22 — Promote unmapped assignee → Person

**What to build:** The primary, low-friction path for adding a team member — one click on an already-visible "unmapped assignee" row in either Planning or Status, rather than hand-typing their Jira account id. Demoable: sync a ticket assigned to someone not yet on the team, see it land in the flagged unmapped row, click "Add as Person", confirm the pre-filled name/email/accountId, and see them appear as a real team member. See `.scratch/sprint-jira-integration/spec.md` ("Team & person management flow — person mapping").

**Blocked by:** 12 — Team, Person & TeamMembership: models + CRUD API; 18 — Planning view: capacity strip + ticket table; 21 — Status view UI.

**Status:** ready-for-agent

- [ ] A one-click "Add as Person" affordance on the unmapped-assignee row in both the Planning table (ticket 18) and the Status roster's unmapped bucket (ticket 21), pre-filled from that ticket's cached `assigneeAccountId`/`assigneeDisplayName`/`assigneeEmail` (ticket 13's `Ticket` schema).
- [ ] Confirming creates the `Person` via `POST /api/people` and, in the same step, offers to add them to the current team via `POST /api/team-memberships` (role defaults to unset/prompt — no silent default role) using ticket 12's API.
- [ ] On success, the ticket that triggered the promotion re-renders under the newly-created person's row/column instead of the unmapped bucket, with no manual refresh needed.
- [ ] Frontend tests cover: the pre-fill values matching the source ticket's cached assignee fields, the created person/membership round-tripping through ticket 12's API, and the promoted ticket moving out of the unmapped bucket in both Planning and Status views.
