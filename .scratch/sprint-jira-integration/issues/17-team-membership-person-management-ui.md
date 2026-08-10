# 17 — Team membership & person management UI

**What to build:** The roster sub-view inside "Manage teams" where a team lead adds people, sets their role/capacity, and removes them — the manual-entry half of person management (the promote-from-unmapped-assignee shortcut is ticket 22, since it needs synced ticket data to exist first). Demoable: from a team's "Manage teams" panel, add a person by hand, set their role and an optional capacity override, edit it inline, and remove them. See `.scratch/sprint-jira-integration/spec.md` ("Team & person management flow").

**Blocked by:** 16 — Sprint navigation shell.

**Status:** ready-for-human

- [x] A per-team roster sub-view inside the "Manage teams" panel (ticket 16): selecting a team shows its `TeamMembership` rows (person name, role, effective capacity %) via `GET /api/team-memberships?teamId=`.
- [x] "Add person" flow: pick an existing `Person` (autocomplete over all people, not team-scoped) via `GET /api/people`, or open a manual-entry form (name, email, `jiraAccountId`) that `POST`s `/api/people` — then set role (`<select>` over the `Role` union) and capacity (defaults to the role's default, optional override input) and `POST /api/team-memberships` in the same step.
- [x] If ticket 11's live verification confirmed the "Browse users and groups" permission is available, the manual-entry form's name/email fields get autocomplete via a backend passthrough to `jiraClient.searchUsers` (fills `jiraAccountId` on pick); if not confirmed, plain manual fields only — this must degrade silently, not block the form.
- [x] Inline edit: role and capacity edited directly on the roster row (no modal) via `PATCH /api/team-memberships/:id`. The capacity input shows the role's default as a placeholder when no override is set; clearing the field explicitly sends `capacityPercentOverride: null`.
- [x] Remove: a lightweight confirm (same pattern as profile delete, no cascade-listing copy needed since nothing downstream is destroyed) calling `DELETE /api/team-memberships/:id`.
- [x] Frontend tests cover: add-existing-person, add-via-manual-entry, inline role/capacity edit (including explicit clear-to-null), and remove — each verified against ticket 12's API contract (mocked or integration).

## Comments

Implemented per checklist above. Notes for whoever reviews/picks up ticket 22:

- Ticket 11's live verification confirmed the "Browse users and groups" permission **is** available for this token, so `GET /api/people/jira-search` (a thin passthrough to `jiraClient.searchUsers`, added to `routes/people.ts`) is wired as real autocomplete in the manual-entry form, not a stub — it still degrades silently (stops retrying for the rest of that form's lifetime) if a `null`/403 ever comes back.
- Data-shape gotcha worth flagging: ticket 12's `POST /api/team-memberships` does **not** populate `personId` in its response (only `PATCH` does) — `useTeamRoster.ts`'s `addExistingPerson` re-fetches the whole roster after a successful create rather than trusting the POST response, to avoid rendering an unpopulated `personId` string where a `Person` object is expected.
- The roster sub-view lives in a new `TeamRoster.tsx`, toggled per-team by a "👥" button added to `TeamSwitcher.tsx`'s existing team row (accordion-style, inside the same "Manage teams" panel — the panel widens from `w-72` to `w-96` while a roster is expanded). `useTeamRoster.ts` owns all the roster-panel API calls (memberships CRUD, people list, person create, jira-search); `TeamRoster.tsx` owns its own remove-confirm dialog locally (no cascade data to compute, unlike Team/Profile delete).
- Manually verified end-to-end via chrome-devtools against a disposable "ZZ Test Roster" team (left in place, not cleaned up, per this ticket's low stakes) — add-existing, add-manual-entry, inline role edit, inline capacity edit incl. explicit clear-to-null, and remove-with-confirm all round-tripped correctly against the real backend.
- Skipped per this run's instructions: no Jira writes anywhere (only the existing read-only `searchUsers` passthrough is touched), and the code-review pass was skipped on request.
- Verification commands run — all green: `pnpm typecheck` (0 errors), `pnpm --filter backend test` (29 files / 360 tests), `pnpm --filter frontend test` (21 files / 301 tests).
