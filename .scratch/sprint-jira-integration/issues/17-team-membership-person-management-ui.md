# 17 — Team membership & person management UI

**What to build:** The roster sub-view inside "Manage teams" where a team lead adds people, sets their role/capacity, and removes them — the manual-entry half of person management (the promote-from-unmapped-assignee shortcut is ticket 22, since it needs synced ticket data to exist first). Demoable: from a team's "Manage teams" panel, add a person by hand, set their role and an optional capacity override, edit it inline, and remove them. See `.scratch/sprint-jira-integration/spec.md` ("Team & person management flow").

**Blocked by:** 16 — Sprint navigation shell.

**Status:** ready-for-agent

- [ ] A per-team roster sub-view inside the "Manage teams" panel (ticket 16): selecting a team shows its `TeamMembership` rows (person name, role, effective capacity %) via `GET /api/team-memberships?teamId=`.
- [ ] "Add person" flow: pick an existing `Person` (autocomplete over all people, not team-scoped) via `GET /api/people`, or open a manual-entry form (name, email, `jiraAccountId`) that `POST`s `/api/people` — then set role (`<select>` over the `Role` union) and capacity (defaults to the role's default, optional override input) and `POST /api/team-memberships` in the same step.
- [ ] If ticket 11's live verification confirmed the "Browse users and groups" permission is available, the manual-entry form's name/email fields get autocomplete via a backend passthrough to `jiraClient.searchUsers` (fills `jiraAccountId` on pick); if not confirmed, plain manual fields only — this must degrade silently, not block the form.
- [ ] Inline edit: role and capacity edited directly on the roster row (no modal) via `PATCH /api/team-memberships/:id`. The capacity input shows the role's default as a placeholder when no override is set; clearing the field explicitly sends `capacityPercentOverride: null`.
- [ ] Remove: a lightweight confirm (same pattern as profile delete, no cascade-listing copy needed since nothing downstream is destroyed) calling `DELETE /api/team-memberships/:id`.
- [ ] Frontend tests cover: add-existing-person, add-via-manual-entry, inline role/capacity edit (including explicit clear-to-null), and remove — each verified against ticket 12's API contract (mocked or integration).
