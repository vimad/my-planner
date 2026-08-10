# 12 — Team, Person & TeamMembership: models + CRUD API

**What to build:** The backend foundation for teams and their people — three Mongoose models and their full CRUD routes. No Jira dependency, no UI — verified via API tests. See `.scratch/sprint-jira-integration/spec.md` ("Domain model — Team, Person, membership").

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] `packages/backend/src/models/Team.ts`: `name: string` (required), `jiraLabels: string[]` (required, phase 1 always exactly one entry).
- [ ] `packages/backend/src/models/Person.ts`: `name: string`, `email: string` (display only), `jiraAccountId: string` (required, unique — the actual match key, see ADR 0001).
- [ ] `packages/backend/src/models/TeamMembership.ts`: `teamId` (ref `Team`, required), `personId` (ref `Person`, required), `role: Role` (`'TL' | 'ATL' | 'SSE' | 'SE' | 'SQA' | 'QA' | 'Intern'`), `capacityPercentOverride: number | null` (default `null`). Unique compound index on `(teamId, personId)`.
- [ ] A `ROLE_DEFAULT_CAPACITY_PERCENT: Record<Role, number>` constant (shared type module, e.g. `packages/backend/src/models/Role.ts` or alongside `TeamMembership.ts`), seeded from the reference spreadsheet's role defaults. Effective capacity % is computed, never stored: `capacityPercentOverride ?? ROLE_DEFAULT_CAPACITY_PERCENT[role]`.
- [ ] `packages/backend/src/routes/teams.ts`: `POST /api/teams` (`{ name, jiraLabels }`), `GET /api/teams`, `PATCH /api/teams/:id` (rename, edit `jiraLabels` — no cache invalidation needed elsewhere, per the spec), `DELETE /api/teams/:id`.
- [ ] `packages/backend/src/routes/people.ts`: `POST /api/people` (`{ name, email, jiraAccountId }`), `GET /api/people`, `PATCH /api/people/:id`, `DELETE /api/people/:id`.
- [ ] `packages/backend/src/routes/teamMemberships.ts`: `POST /api/team-memberships` (`{ teamId, personId, role, capacityPercentOverride? }`), `GET /api/team-memberships?teamId=` (roster for a team, `Person` populated), `PATCH /api/team-memberships/:id` (`{ role?, capacityPercentOverride? }` — sending `capacityPercentOverride: null` explicitly reverts to the role default), `DELETE /api/team-memberships/:id` (removes the membership only — `Person` and any of that person's `SprintPlanEntry`/`Ticket` data are untouched, since a person may belong to other teams).
- [ ] Backend tests (HTTP layer via `createApp()` + `supertest`) cover: CRUD for all three models, the unique-compound-index rejection on a duplicate `(teamId, personId)` membership, `capacityPercentOverride` null-fallback behavior on both create and explicit-clear-to-null, and that removing a membership doesn't cascade-delete the `Person`.
