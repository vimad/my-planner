# 15 — Status view backend: Status model + Lightweight sync

**What to build:** The backend half of the Status view — the locally-mirrored workflow-status set and the per-person Lightweight sync that discovers a person's current tickets. Backend-only, verified via API tests with `jiraClient` mocked. See `.scratch/sprint-jira-integration/spec.md` ("Domain model — Sprint, Ticket, Epic, Status", "Sync semantics & staleness").

**Blocked by:** 11 — Jira API client, config & live verification; 13 — Sprint, Ticket, Epic & SprintPlanEntry: models + Full sync + Planning API.

**Status:** ready-for-agent

- [x] `packages/backend/src/models/Status.ts`: `name` (unique), `order: number`, `category: 'todo' | 'in_progress' | 'done'`, `lastSyncedAt` — refreshed wholesale from the Jira board's workflow column configuration, never hand-edited.
- [x] A shared "refresh status set" routine (`services/statusSync.ts`'s `refreshStatusSet`), called as a side effect of *every* sync action (both this ticket's Lightweight sync and ticket 13's Full sync, i.e. both `sprintPlanEntries.ts` endpoints) — no dedicated endpoint or button for it.
- [x] `packages/backend/src/routes/statusSync.ts`: `POST /api/status-sync` — body `{ teamId, personId, sprintId }`. Runs `jiraClient.searchJql` with `assignee = <accountId> AND sprint = <sprintId> AND labels in (<teamLabel>)`, `fields=summary,status`, and upserts `Ticket` docs (ticket 13's model) with only `title`/`status`/`lastSyncedAt` touched — every other field left as-is if the `Ticket` already existed, or `null` if newly discovered this way (so a ticket found only via this path renders as an unknown type until some Full sync fills it in).
- [x] `GET /api/statuses` — the current mirrored status set, ordered.
- [x] Backend tests cover: a Lightweight sync creating a new `Ticket` with only title/status populated (other fields `null`), a Lightweight sync on an *already Full-synced* ticket leaving its other fields untouched, and the shared status-refresh routine being exercised by both sync paths.
