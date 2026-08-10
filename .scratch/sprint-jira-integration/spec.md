# Sprint (Jira Integration) — phase 1

Status: ready-for-agent

Source: synthesized from the [Sprint (Jira Integration) — Phase 1 Planning Map](map.md) (ten resolved tickets: [Jira Cloud REST API integration surface](issues/01-jira-api-integration-surface.md), [Team, Person & Team-Membership data model](issues/02-team-person-membership-data-model.md), [Sprint, Ticket, Sub-task & Epic data model](issues/03-sprint-ticket-epic-data-model.md), [Capacity formula](issues/04-capacity-formula.md), [Sync semantics & staleness](issues/05-sync-semantics-staleness.md), [Sprint tab navigation & routing](issues/06-sprint-tab-navigation-routing.md), [Team & person management flow](issues/07-team-person-management-flow.md), [Planning view UI](issues/08-planning-view-ui.md), [Status view UI](issues/09-status-view-ui.md), [Per-person ticket order: persisted or session-only?](issues/10-planning-ticket-order-persistence.md)), plus [ADR 0001](../../docs/adr/0001-match-jira-assignees-by-account-id.md), [ADR 0002](../../docs/adr/0002-separate-sprint-plan-entry-from-ticket.md), [ADR 0003](../../docs/adr/0003-status-view-only-shows-occupied-columns.md), and the domain terms already recorded in [CONTEXT.md](../../CONTEXT.md).

## Problem Statement

Sprint planning and status tracking for this team currently happens in a spreadsheet, hand-copied against Jira. This introduces a new **Sprint** section in my-planner: a read-only convenience layer over Jira, independent of the existing Profile system (categories/todos/notes/boards). It adds a first-class, multi-team-capable **Team** entity — each team a named subset of people, scoped over a shared Jira backlog/board via a label filter — with two views per team:

- **Planning** — a per-sprint, per-person capacity table (Total/Available/Planned/Remaining hours) against manually-entered Jira tickets, plus an active-epics list.
- **Status** — a Jira-board-style, per-person view of that person's current tickets, auto-discovered from Jira.

Both views cache Jira data locally and sync only on explicit user action — Jira is always the source of truth; nothing here writes back to it. Phase 1 excludes write-back and the future cross-team/cross-sprint scheduler (see Out of scope), but the data model is shaped not to preclude either later.

**Jira instance**: `wealthos.atlassian.net`, project `WOSMVP` (ticket URLs `https://wealthos.atlassian.net/browse/WOSMVP-{number}`). A working personal API token already exists for the target user; no access-provisioning step is needed for phase 1.

## Domain model

Terminology matches [CONTEXT.md](../../CONTEXT.md) exactly — see that file for the prose glossary. Schemas below follow this repo's existing flat, one-file-per-model Mongoose style (see `packages/backend/src/models/Todo.ts`, `Board.ts`).

### Team, Person, membership — `packages/backend/src/models/{Team,Person,TeamMembership}.ts`

```ts
// Team.ts
export interface TeamDoc {
  name: string
  jiraLabels: string[] // array for future flexibility; exactly one entry per team in phase 1
  createdAt: Date
  updatedAt: Date
}

// Person.ts
export interface PersonDoc {
  name: string
  email: string // display/contact only — NOT the match key, see ADR 0001
  jiraAccountId: string // required, unique — the actual key matched against Ticket.assigneeAccountId
  createdAt: Date
  updatedAt: Date
}

// Role is a fixed TS union, not a DB collection — each value maps to a
// hardcoded default capacity % via a constant lookup.
export type Role = 'TL' | 'ATL' | 'SSE' | 'SE' | 'SQA' | 'QA' | 'Intern'
export const ROLE_DEFAULT_CAPACITY_PERCENT: Record<Role, number> = { /* seeded from the reference spreadsheet */ }

// TeamMembership.ts
export interface TeamMembershipDoc {
  teamId: Types.ObjectId // ref Team, required
  personId: Types.ObjectId // ref Person, required — a Person may hold memberships in more than one Team
  role: Role
  capacityPercentOverride: number | null // effective % = capacityPercentOverride ?? ROLE_DEFAULT_CAPACITY_PERCENT[role]
  createdAt: Date
  updatedAt: Date
}
// unique compound index on (teamId, personId)
```

**Unmapped assignee** is never stored: purely a display-time comparison of a cached `Ticket.assigneeAccountId` against the selected team's current `TeamMembership` list. A team's `jiraLabels` can be edited freely with no cache invalidation or backfill, for the same reason — team membership of a ticket is always computed live from `Ticket.labels`, never persisted.

### Sprint, Ticket, Epic, Status — `packages/backend/src/models/{Sprint,Ticket,Epic,Status}.ts`

```ts
// Sprint.ts
export interface SprintDoc {
  jiraSprintId: string
  name: string // e.g. "WOSMVP sprint 132"
  state: 'active' | 'future' | 'closed'
  startDate: Date | null
  endDate: Date | null
  lastSyncedAt: Date
}

// Ticket.ts — the ONE representation of a Jira issue (Bug/Story/Task/Sub-task),
// shared unmodified across Planning, Status, and Epic views. No per-view duplication.
export interface TicketDoc {
  jiraKey: string // full key e.g. "WOSMVP-14782", unique; UI strips the "WOSMVP-" prefix for display/entry
  type: string
  title: string
  status: string // matches a Status.name
  assigneeAccountId: string | null // matched against Person.jiraAccountId; no match = unmapped (display-time only)
  estimateHours: number | null // raw Jira value, as-is even when sub-tasks also carry estimates
  labels: string[]
  stream: string | null
  epicKey: string | null
  parentKey: string | null // sub-task → parent ticket
  subtaskKind: 'Dev' | 'Test' | null // parsed from the "[Dev]"/"[Test]" title prefix at sync time
  currentSprintKey: string | null // snapshot of Jira's live sprint field — see SprintPlanEntry below, ADR 0002
  lastSyncedAt: Date
}
// Effort (used by capacity math) is COMPUTED, never stored: sum of child
// sub-tasks' estimateHours (queried via parentKey) if any exist, else the
// ticket's own estimateHours.

// Epic.ts
export interface EpicDoc {
  jiraKey: string // unique
  title: string
  status: string
  lastSyncedAt: Date
}
// Child-ticket rollup (count, progress) is always computed by querying
// Ticket.epicKey — never stored on the Epic doc.

// Status.ts — mirrors the Jira board's real workflow columns; refreshed
// wholesale from Jira on every sync, never hand-edited.
export interface StatusDoc {
  name: string // unique
  order: number
  category: 'todo' | 'in_progress' | 'done'
  lastSyncedAt: Date
}
```

### Sprint Plan Entry — `packages/backend/src/models/SprintPlanEntry.ts`

Join: Team × Sprint × Ticket. Records that a ticket was manually added to a specific team's plan for a specific sprint — the historical record, decoupled from `Ticket.currentSprintKey` (Jira's live answer) so a carried-over ticket keeps appearing in every sprint's plan it was ever added to. See [ADR 0002](../../docs/adr/0002-separate-sprint-plan-entry-from-ticket.md).

```ts
export interface SprintPlanEntryDoc {
  teamId: Types.ObjectId // ref Team
  sprintId: Types.ObjectId // ref Sprint
  ticketId: Types.ObjectId // ref Ticket
  addedAt: Date
  // Per-assignee drag order within the Planning view's "Tickets by person"
  // table — see ticket 10. NOT a global order across the whole plan; only
  // meaningful relative to other entries sharing this ticket's current
  // assignee. Reset to the end of the new assignee's row (max(order)+1
  // among their entries) if a re-sync changes the ticket's assignee.
  // Untouched by TeamMembership changes (leave/rejoin) — it's keyed off
  // the ticket's current assignee, not membership.
  order: number
}
// unique compound index on (teamId, sprintId, ticketId)
```

### Capacity — `packages/backend/src/models/{TeamSprintPlan,CapacityEntry,CapacityLookup}.ts`

```ts
// TeamSprintPlan.ts — Team × Sprint header
export interface TeamSprintPlanDoc {
  teamId: Types.ObjectId
  sprintId: Types.ObjectId
  workingDays: number // manually entered, holiday-adjusted (e.g. 10/9/8/7) — NOT derived from a holiday calendar
}
// unique on (teamId, sprintId)

// CapacityEntry.ts — a TeamMembership's leave for one Sprint
export interface CapacityEntryDoc {
  teamMembershipId: Types.ObjectId // ref TeamMembership
  sprintId: Types.ObjectId
  leaveDays: number // 0.5-day granularity, default 0
}
// unique on (teamMembershipId, sprintId)

// CapacityLookup.ts — global, admin-editable via a settings view (data
// entry, not a code change); seeded with the reference spreadsheet's 12
// cells (50/70/80% × 7/8/9/10 days).
export interface CapacityLookupDoc {
  percentage: number
  days: number
  hours: number
}
```

**Formula** (per person, per team, per sprint) — see [Capacity formula](issues/04-capacity-formula.md):

1. `Total = (TeamSprintPlan.workingDays − CapacityEntry.leaveDays) × 8`
2. `effectiveDays = Total / 8`
3. `Available` = matching `CapacityLookup` row for `(effectivePercentage, effectiveDays)` if one exists, **else** `Total × (effectivePercentage / 100)`
4. `Planned` = sum of Effort across tickets in this team+sprint's `SprintPlanEntry` list whose *current* Jira assignee matches this person
5. `Remaining = Available − Planned`

`effectivePercentage` = `TeamMembership.capacityPercentOverride ?? ROLE_DEFAULT_CAPACITY_PERCENT[role]`. 8 hours/day is a hardcoded constant, not configurable, in phase 1.

## Jira integration surface

Full endpoint shapes, example requests/responses, and citations: [research/jira-api-integration-surface.md](research/jira-api-integration-surface.md). Summary for implementation:

- **Auth**: Basic auth, `email:api_token` base64, against both `/rest/api/3` and `/rest/agile/1.0`. Config lives in `packages/backend/.env` as `JIRA_BASE_URL`, `JIRA_EMAIL`, `JIRA_API_TOKEN` (matching the existing `.env.example` pattern). Tokens default to 1-year expiry (policy since Dec 2024) — surface the expiry somewhere in config/UI so it doesn't fail silently a year in.
- **Boards/sprints**: `GET /rest/agile/1.0/board?projectKeyOrId=WOSMVP` resolves the board id; `GET /rest/agile/1.0/board/{boardId}/sprint?state=active,future,closed` lists/filters sprints, feeding `Sprint.state`.
- **Epic/parent linkage**: build `Ticket.epicKey`/`parentKey` off the unified `fields.parent` field — Jira's Epic Link → `parent` migration is fully rolled out; no legacy Epic Link lookup needed.
- **Assignee**: `accountId` is always present on `fields.assignee`; `emailAddress`/`displayName` may be `null` per privacy settings — this is *why* `Person`/`Ticket` match on `jiraAccountId`, not email (ADR 0001).
- **"Stream" custom field**: resolve its `customfield_XXXXX` id once via `GET /rest/api/3/field/search?query=Stream&type=custom`, cache the id in config — don't re-resolve every sync.
- **Search**: legacy `/rest/api/3/search` is sunset. Use `POST/GET /rest/api/3/search/jql` (token-based `nextPageToken` pagination) for JQL discovery, and `POST /rest/api/3/issue/bulkfetch` (≤100 keys/call) for refreshing a known set of tickets.
- **User lookup** (for the team/person management flow): `GET /rest/api/3/user/search?query=` matches `displayName`/`emailAddress` prefix, but requires the **"Browse users and groups"** global permission — separate from (and not guaranteed alongside) the "Browse projects" permission that read-only ticket access needs. Treated as an optional convenience only (see Team & person management below); its absence must degrade gracefully, never block.
- **Rate limits**: a manual sync-button click (tens of issues) costs on the order of 30–100 points against an hourly quota in the tens/hundreds of thousands — a non-issue. Only worth handling `429`/`Retry-After` gracefully.

**Needs live verification during implementation** (can't be resolved from docs alone): the real board id for "Odyssey"/WOSMVP; the actual `customfield_XXXXX` id and select-type for "Stream"; the exact `subtasks` array shape on a real issue; whether `emailAddress`/`parent` are populated as expected on a real WOSMVP issue under this org's privacy settings; a smoke test confirming `/search/jql` works on `wealthos.atlassian.net`; and whether the personal API token's account has the "Browse users and groups" permission.

## Sync semantics & staleness

No background/scheduled sync anywhere in phase 1 — every sync below is user-triggered. See [Sync semantics & staleness](issues/05-sync-semantics-staleness.md).

- **Full sync** (fetches a ticket's complete field set): typing a ticket number into the Planning "Add to plan" bar Full-syncs that ticket, then follows its `subtasks` refs and Full-syncs each sub-task in the same action. The Planning view's global "Sync plan" button Full-syncs every ticket already in that team+sprint's `SprintPlanEntry` list plus their linked sub-tasks, batched via `issue/bulkfetch` (≤100 keys/call).
- **Lightweight sync** (fetches only title + status): the Status view's per-person sync icon runs `search/jql` with `assignee = <accountId> AND sprint = <sprintId> AND labels in (<teamLabel>)`, `fields=summary,status`. A ticket discovered only this way has every other `Ticket` field `null` until some Full sync (e.g. via Planning) fills them in — accepted as fine for phase 1, rendered with a muted "?" type badge.
- **Status set refresh**: piggybacks as a side effect of every sync action (Planning or Status), refreshing `Status` wholesale from the board's workflow config. No dedicated button.
- **Staleness display**: relative-time rendering of each `Ticket.lastSyncedAt` per ticket (e.g. "Synced 2h ago", exact time on hover) — no threshold-based visual warning in phase 1.

## Navigation & routing

See [Sprint tab navigation & routing](issues/06-sprint-tab-navigation-routing.md).

**URL scheme** — a hard top-level split from the existing `/:profileSlug/:tab` (`packages/frontend/src/App.tsx`):

```
/sprint                — no team resolved; resolves last-active team, redirects
/sprint/:teamSlug       — redirects to .../planning
/sprint/:teamSlug/planning
/sprint/:teamSlug/status
/sprint/:teamSlug/epics
```

`:teamSlug` mirrors `:profileSlug` exactly (same `profileSlug()`-style slugification over `Team.name`). This permanently reserves `sprint` as an unusable profile name — flagged, not enforced.

**Two-shell architecture**: `App.tsx`'s `<Routes>` mounts a new `SprintShell` for `/sprint/*`, and the existing `AppShell` (unchanged) for everything else — a hard split at the router level. `TabKey` stays `'todos' | 'notes' | 'boards'`; it does not grow a `'sprint'` member. `AppShell`'s existing profile/todo/notes/boards state and effects are untouched; `SprintShell` is a clean-room component scoped to team/sprint concerns.

**Header**: a small shared `<Header>` component (logo/wordmark, theme toggle, switcher slot) is extracted, rendered by both shells, taking the switcher (`ProfileSwitcher` vs. a new `TeamSwitcher`) as a prop/children.

**Returning to the app**: `SprintShell`'s `<Header>` includes a "back to app" affordance (clicking the wordmark) that calls `navigate('/')`. Since `AppShell`'s URL-reconciliation effect only ever mounts on non-`/sprint/*` routes, it never needs a "profile-less route" special case — landing at `/` hits its existing "resolve `activeProfileId` from `localStorage`, push `/${slug}/todos`" path unchanged. Landing tab is always `todos` (consistent with today: `activeTab` was never itself persisted).

**Last-active team**: mirrors `activeProfileId` exactly — a new `localStorage` key `planner-active-team-id`, read/written by a new `useActiveTeam` hook structurally parallel to `useActiveProfile.ts` (fetch team list, resolve stored id, fall back to first team if unset/stale, expose `setActiveTeamId`). No per-team last-active-sub-view persistence — bare `/sprint/:teamSlug` always redirects to `.../planning`.

**Sub-navigation** (Planning / Status / Epics): a tab-pill row directly under the header inside `SprintShell`, visually identical to the existing Todos/Notes/Boards `role="tablist"` pill row (per `docs/ui-conventions.md`), driven by the route segment instead of `activeTab` state.

## Team & person management flow

See [Team & person management flow](issues/07-team-person-management-flow.md).

**Team creation & label config**: a "Manage teams" panel, modeled directly on `ProfileSwitcher.tsx`'s "Manage profiles" panel (gear-icon trigger from `TeamSwitcher`, create/rename/delete, inline editing). Fields: `name`, `jiraLabels` (phase 1: single label, inline-edited, no separate flow). Changing a label needs no cache invalidation or backfill — team membership is always computed live from `Ticket.labels` at query/render time; `SprintPlanEntry` rows are the one persisted exception and are untouched by a later label change.

**Person mapping** — two paths, primary avoiding the `user/search` permission risk entirely:
- **Primary — promote an unmapped assignee**: wherever unmapped assignees surface (Planning/Status views), a one-click "Add as Person" pre-fills from that ticket's already-cached assignee data (`assigneeAccountId`, `displayName`, `emailAddress`) and creates the `Person` (+ optionally the `TeamMembership`) in the same flow. Zero new Jira API calls.
- **Secondary — manual entry**: a plain "Add person" form (name, email, `jiraAccountId`) for someone with no synced tickets yet. If `user/search` is confirmed working for this token during implementation, wire it as autocomplete on this form; otherwise fall back to plain manual fields — not a phase-1 blocker.

**Team membership editing**: a per-team roster sub-view inside "Manage teams" — select a team, see its `TeamMembership` rows (person, role, effective capacity %), list-with-inline-actions pattern.
- **Add**: pick an existing `Person` (autocomplete over all people, not team-scoped) or create one via the manual-entry form, then set role (`<select>` over the `Role` union) and capacity (defaults to role default, optional override) in one step.
- **Edit**: role and capacity edited inline on the roster row — capacity input shows the role-default as a placeholder when `capacityPercentOverride` is `null`; clearing it reverts to `null`.
- **Remove**: deletes the `TeamMembership` only (same lightweight confirm pattern as profile delete); the `Person` persists, since they may belong to other teams.

## Planning view UI

See [Planning view UI](issues/08-planning-view-ui.md). Kanban-by-assignee layout, winner of a three-way `/prototype` comparison (branch `prototype/sprint-planning-view-variants`, `packages/frontend/src/prototype-views/sprint-planning/`). Follow `docs/ui-conventions.md` for table/card/button styling.

- **Capacity strip**: compact per-person cards (role, a planned/available progress bar, remaining hours, leave days) in a horizontal strip — not a dense table.
- **Epics**: a horizontal pill strip (title + done/total rollup); clicking one opens a full modal (ui-conventions archetype B) with a stub detail view (real version deep-links to Jira). This is the phase-1 Epic view in full — no dedicated route beyond this.
- **Ticket entry**: a single "Add to plan — WOSMVP-<input>" bar; submitting a number triggers the Full sync described above.
- **Sync**: one global "Sync plan" button only — deliberately no per-ticket resync affordance (sync semantics only define single-entry and sync-all).
- **"Tickets by person" table**: one row per person, their planned tickets rendered as small ticket-number badges, **drag-and-drop reorderable within their row** (same `@dnd-kit` sortable pattern as `TodoDetail.tsx`'s linked-todo list / `BoardsView.tsx`). Reordering triggers a save-on-drop mutation writing `SprintPlanEntry.order` (see ticket 10, above). Unmapped assignees get the same row shape at the bottom of the table, flagged amber.

## Status view UI

See [Status view UI](issues/09-status-view-ui.md). Roster-sidebar layout, winner of a three-way `/prototype` comparison (branch `prototype/sprint-status-view-variants`, `packages/frontend/src/prototype-views/sprint-status/`).

- **Roster sidebar**: left-hand list of the team, each row showing ticket count + last-synced + its own per-person sync icon — sync is scoped spatially to the person, not a global toolbar control.
- **Ticket card**: key, title, type badge, stream badge, sync time, and a one-click "open in Jira" affordance (new tab). A ticket discovered only via Lightweight sync shows a muted "?" type badge until a Full sync fills in the rest.
- **Board columns**: only render a status column the selected person actually has a ticket in *right now* — never all seven locally-mirrored statuses with blanks for the empty ones. See [ADR 0003](../../docs/adr/0003-status-view-only-shows-occupied-columns.md).

## Out of scope

(Carried from the map, unchanged.) Writing updates back to Jira. A comprehensive cross-team/cross-sprint scheduler — the data model and views stay easy to extend toward it, but no implementation detail for it is decided here. Cross-team capacity rollup (a consolidated view of one person's total commitment across multiple teams) — not requested yet, deferred until that overlap actually occurs in practice.

## Primary sources

- [Jira Cloud REST API integration surface — full findings](research/jira-api-integration-surface.md)
- Planning view UI prototype (three compared variants — spreadsheet mirror, kanban by assignee, split focus panel): branch `prototype/sprint-planning-view-variants`
- Status view UI prototype (three compared variants — single board, roster sidebar, swimlanes): branch `prototype/sprint-status-view-variants`
- [ADR 0001 — match Jira assignees by accountId](../../docs/adr/0001-match-jira-assignees-by-account-id.md)
- [ADR 0002 — separate Sprint Plan Entry from Ticket](../../docs/adr/0002-separate-sprint-plan-entry-from-ticket.md)
- [ADR 0003 — Status view only shows occupied columns](../../docs/adr/0003-status-view-only-shows-occupied-columns.md)
