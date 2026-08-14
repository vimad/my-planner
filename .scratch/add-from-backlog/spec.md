# Spec: Add from backlog

Status: ready-for-agent

Source: synthesized directly from a `/prototype` + `/to-spec` conversation. Three UI variants were prototyped on the real `/sprint/:teamSlug/planning` route; the user picked Variant A (anchored popover). Two backend/data-flow seams were confirmed with the user afterward. See Further Notes for the prototype branch.

## Problem Statement

Sprint Planning's "Add to plan" bar only lets you add a Jira ticket you already know the number of (type a bare `WOSMVP-` number and hit Add) or create a non-Jira Placeholder ticket. There's no way to *browse* the team's actual backlog and pick something — you have to already know the ticket key, sourced from outside the app (Jira itself, Slack, memory). The team's real backlog lives across three sprints on Jira's **Product Delivery Board**: technical/ops work sits in the **Tech and Ops Backlog** sprint, product work in the **Product Backlog** sprint, and bugs in the **Bug backlog** sprint — all scoped down to the team's own tickets via the same `Team.jiraLabels` mechanism already used to filter the current sprint's tickets (e.g. a team whose `jiraLabels` includes `"Odyssey"`).

## Solution

A third icon-only button, **"Add from backlog"**, sits in `AddToPlanForm` right after the existing "Add placeholder ticket" button. Clicking it opens a small anchored popover (same footprint/shape as `AddSprintPopover`) scoped to the current team:

- Three category tabs — **Technical** (Tech and Ops Backlog), **Product** (Product Backlog), **Bugs** (Bug backlog) — each a live, uncached query against that named sprint on the Product Delivery Board, filtered server-side to the team's `jiraLabels` (the same scoping every other Planning ticket list already uses — no separate on/off toggle).
- A text search box that narrows the currently-selected category's results by key or title.
- Each result row shows the ticket key, truncated title, and its current Jira assignee(s) as a small round initials avatar (a new, first-of-its-kind avatar component in this app) — two avatars (Dev, QA) for a Story/Bug's resolved Sub-task assignees, one avatar for a Task's plain assignee. An unassigned role/ticket shows a neutral "UN" avatar instead of a name's initials.

Clicking a result **reuses the exact existing add-and-assign pipeline, unchanged**: it adds the ticket to the plan the same way typing a ticket number into the existing "Add" input and submitting does (`addTicket`/`POST /api/sprint-plan-entries`), then always opens the same real per-ticket popup that opens when clicking an already-added ticket's badge in "Tickets by person" — `DevQaAssignmentPopup` for a Split (Story/Bug) ticket, `TicketInfoPopup` for a Task — pre-filled from Jira's current Dev/QA/assignee, exactly as today. No new popup, no new "confirm and save" component. The only new backend surface is the read-only backlog-browsing query itself; every mutation (add to plan, Dev/QA Override, Assignee Override, Plan/Spill) goes through routes that already exist.

## User Stories

1. As a Planning user, I want a button to browse the team's Jira backlog from inside Sprint Planning, so that I don't have to already know a ticket's key to add it.
2. As a Planning user, I want the backlog split into Technical/Product/Bugs tabs, so that I can go straight to the kind of work I'm looking for instead of scrolling one long mixed list.
3. As a Planning user, I want the backlog list scoped to my team's own Jira labels automatically, so that I never see another team's tickets mixed in.
4. As a Planning user, I want to search by ticket key or title within a category, so that I can find a specific ticket quickly in a backlog with dozens of items.
5. As a Planning user, I want to see each backlog ticket's current Dev and QA (or plain assignee, for a Task) at a glance as a small avatar, so that I know who's already on it before I even open it.
6. As a Planning user, I want an unassigned role to show clearly (a neutral "UN" avatar) rather than looking broken or blank, so that I can immediately tell a ticket needs an owner.
7. As a Planning user, I want clicking a backlog ticket to open the exact same detail popup I'd get by clicking that ticket after it's already in the plan, so that adding-from-backlog and refining-an-existing-entry feel like one consistent flow, not two different UIs.
8. As a Planning user, I want that popup pre-filled with Jira's current Dev/QA/assignee (same as today), so that I only have to change what's actually wrong rather than re-entering everything.
9. As a Planning user, I want Save in that popup to both add the ticket to the plan and apply whatever Dev/QA/assignee/Plan-hours I picked, so that one Save finishes the whole "add from backlog" action.
10. As a Planning user, I want the ticket to already be visible in "Tickets by person" (unassigned/needs-assignment bucket) if I close the popup without saving, so that backlog-add behaves exactly like the existing typed "Add" button already does today — no silent special-casing.
11. As a Planning user, I want the backlog list to always reflect Jira's current state (not a stale cache), so that I don't add a ticket that's actually already been picked up, closed, or moved by someone else.
12. As a Planning user, I want the popover to close automatically once I pick a ticket, so that I land straight on the detail popup without an extra dismiss step.
13. As a developer, I want the Dev/QA Sub-task-assignee resolution used for backlog rows to reuse the same title-prefix (`[Dev]`/`[Test]`) parsing the rest of the app already uses, so that "who's assigned" means the same thing everywhere in Planning.
14. As a Planning user, I want a clear loading state while a category's backlog is being fetched from Jira, and a clear error state if that fetch fails, so that a slow or failing Jira call doesn't look like an empty backlog.
15. As a Planning user on a team with no `jiraLabels` configured, I want the backlog to show as empty rather than error, so that the behavior matches how the rest of Planning already treats an unconfigured team.

## Implementation Decisions

### Backend

- **New route** — `GET /api/tickets/backlog?teamId=&category=tech-ops|product|bug&q=` in a new or extended `packages/backend/src/routes/tickets.ts`-adjacent file. Read-only; live Jira query every call, **no caching, nothing written to the `Ticket` collection or any other collection** — confirmed with the user as the seam of choice over syncing backlog tickets into the `Ticket` cache. Response is a flat list of lightweight summaries for the requested category only (fetched lazily per selected tab, not all three categories in one call — mirrors `AddSprintPopover`'s existing "don't call Jira until there's something to show" convention):
  ```
  { key, title, type, labels, dev: { name } | null, qa: { name } | null, assignee: { name } | null }
  ```
- **New service logic**, alongside `services/sprintSync.ts`/`jiraClient.ts`:
  - Two new named-sprint constants (**Tech and Ops Backlog**, **Product Backlog**, **Bug backlog**), resolved on the existing `FUTURE_SPRINTS_BOARD_NAME` ("Product Delivery Board") board the same way `searchJiraSprints()` already resolves that board — by exact sprint name match within `listSprints(boardId)`.
  - Per category, build a JQL query scoping to that sprint's id and `labels in (...)` against the requesting `Team.jiraLabels`, and run it through the existing `searchJql()` (paginated) exactly like `lightweightSyncTickets` already does for its own JQL.
  - For each Story/Bug result, resolve its Dev/QA Sub-task assignees by reusing the existing `[Dev]`/`[Test]` title-prefix parsing (the same logic `ticketSync.ts`'s `mapIssueToTicketFields`/subtask handling already applies during a Full sync) — applied read-only here, never persisted to `Ticket`/`TicketDevQaOverride`. A Task's plain `assigneeAccountId`/display name is read directly off the issue, no Sub-task lookup needed.
  - An empty `Team.jiraLabels` yields an empty result set for every category (the `labels in ()` JQL clause naturally matches nothing), not an error — same shape as the existing empty-label edge case on `GET /api/tickets`.
- **No new mutation endpoints.** Adding a picked ticket to the plan, and every subsequent Dev/QA Override / Assignee Override / Plan/Spill edit, goes through the existing `POST /api/sprint-plan-entries`, `PUT /api/tickets/:ticketId/dev-qa-override`, `PUT /api/tickets/:ticketId/assignee-override`, `PATCH /api/sprint-plan-entries/:id` routes, completely unchanged.

### Frontend

- **New component — `components/Avatar.tsx`**: round initials avatar (first-of-its-kind in this app — no existing component to extend). Two initials from the first two words of a name (e.g. "Vinod Madubashan" → "VM"), background color deterministically hashed from the name into a small curated palette (same swatch-list pattern as `constants/categoryColors.ts`, but its own palette — categories and people are different domains and shouldn't visually collide). `null`/unassigned always renders "UN" on a neutral slate background, never a palette color. Scoped to this feature for now — retrofitting other existing plain-text person displays (capacity cards, membership selects, etc.) elsewhere in the app is explicitly out of scope for this change.
- **New component — `components/AddFromBacklogPopover.tsx`**: Archetype A anchored popover (`docs/ui-conventions.md`), same shape/positioning convention as `AddSprintPopover.tsx` — trigger button + `absolute`-positioned panel below it, closes on outside click. Contents: category tab row (Technical/Product/Bugs), search input, scrollable result list (key, truncated title, avatar(s)), loading/error states per fetch. Re-fetches when the popover opens and whenever the active category tab changes; the search box filters the already-fetched category client-side (no extra round-trip per keystroke).
- **`hooks/useSprintPlan.ts`**: add a `fetchBacklog(category, query)` action wrapping the new `GET /api/tickets/backlog` call, and an `addFromBacklog(jiraKey)` action that calls the existing `addTicket(jiraKey)` internally and then — unlike the existing typed-Add flow's conditional needs-assignment-only auto-open — **always** sets `popupTicketId` to the newly-added ticket once it reappears in `entries`, regardless of resolved/needs-assignment/unmapped status. This is a second, separate pending-open code path alongside the existing `pendingAutoOpenTicketId` one — the existing typed "Add" button's conditional auto-open behavior (ticket 24: only interrupt for needs-assignment, never for a merely-unmapped or already-resolved role) is unchanged.
- **`components/PlanningView.tsx`**: new icon button (suggest lucide `Inbox`, matching the existing icon-only-button hover convention) in `AddToPlanForm`, immediately after "Add placeholder ticket", mounting `AddFromBacklogPopover`. No changes to `DevQaAssignmentPopup`/`TicketInfoPopup` themselves — they're reused exactly as they already render for an in-plan ticket today.

## Testing Decisions

Only test externally observable behavior — rendered output/callback invocations, not internal state shape.

- **Backend — new test file alongside `routes/tickets.test.ts`**: mocks `jiraClient`'s `resolveBoard`/`listSprints`/`searchJql`/`bulkFetchIssues` (same mocking convention already used in `sprintSync.test.ts`/`ticketSync.test.ts`). Cases: JQL is built with the right sprint id + `labels in (...)` clause per category; Story/Bug rows resolve Dev/QA from `[Dev]`/`[Test]` Sub-tasks the same way a Full sync would; a Task row uses its plain assignee; an empty `Team.jiraLabels` returns an empty list per category, not an error; nothing gets written to `Ticket`/any other collection as a side effect of the call.
- **Frontend — `components/Avatar.test.tsx`** (new): initials extraction (two-word name, one-word name, `null` → "UN"), and that color assignment is deterministic per name (same name always renders the same background) and that `null` always renders the neutral/slate treatment, never a palette color.
- **Frontend — `components/AddFromBacklogPopover.test.tsx`** (new, modeled directly on `AddSprintPopover.test.tsx`'s live-fetch-popover pattern): opening the popover fetches the default category; switching tabs re-fetches; typing in search narrows the currently-rendered list without an extra fetch; loading and error states render; clicking a result closes the popover and invokes the pick callback with that ticket's key.
- **Frontend — `hooks/useSprintPlan.test.ts`** (existing file, extend): `addFromBacklog` calls `addTicket` then always resolves to opening the popup once the entry appears in `entries`, contrasted with a regression case confirming the existing typed-Add path's conditional (needs-assignment-only) auto-open behavior is untouched.
- **Frontend — regression check only, no new assertions needed**: `DevQaAssignmentPopup.test.tsx`/`TicketInfoPopup.test.tsx` already cover Save behavior for an existing entry: since this feature reuses those components unmodified, existing coverage stands as-is.

## Out of Scope

- Any change to `DevQaAssignmentPopup`/`TicketInfoPopup` themselves, or to how Dev/QA Override, Assignee Override, or Plan/Spill are saved — all reused exactly as they work today.
- Caching/syncing backlog tickets into the `Ticket` collection before they're added to a plan (confirmed live-query-only with the user).
- A toggle to browse a team's backlog *without* the `Team.jiraLabels` scoping — backlog browsing is always scoped the same way the rest of Planning already is.
- Retrofitting the new `Avatar` component onto other existing person displays in the app (capacity cards, membership `<select>`s, etc.) — introduced here for the backlog popover only.
- Any write/mutate call to Jira itself (this repo's Jira integration is read-only end to end, per `CLAUDE.md`) — the backlog query is search/read only, same as every other Jira call in this app.
- Drag-reorder, remove, or any other interaction on a backlog result row beyond "click to add" — those only apply once a ticket is already a Sprint Plan Entry.
- A slide-over-drawer or full-modal backlog browser (Variants B/C) — prototyped and explicitly not chosen; preserved on the throwaway branch only.

## Further Notes

- **Prototype branch**: `prototype/add-from-backlog-ui` (commit `ee6fac5`) — three structurally different UI variants (anchored popover, right-edge slide-over drawer, full modal browser with category sidebar + card grid) wired onto the real `/sprint/:teamSlug/planning` route behind `?variant=A|B|C`, with mock backlog data and a mock stand-in confirm popup (not the real `DevQaAssignmentPopup`/`TicketInfoPopup`). The user picked **Variant A**. This branch is a primary source for the popover's exact layout/spacing/tab treatment, but its mock data and mock confirm-popup are not part of the real implementation — the real popup reuse described above supersedes it.
- **Two seams confirmed directly with the user** (not re-litigated during implementation):
  - Backlog browsing is a live, uncached Jira query every time, not a sync into the `Ticket` cache.
  - Picking a backlog ticket reuses the existing add-by-key-then-popup pipeline verbatim (just made unconditional instead of needs-assignment-gated) rather than a new atomic "create with assignment" endpoint — so picking a ticket adds a bare entry to the plan immediately, and Cancelling out of the popup leaves that bare entry in place, identical to today's manual typed-Add behavior.
- Icon choice for the trigger button (suggested: lucide `Inbox`) is a suggestion, not a hard requirement — pick whatever reads clearly as "backlog" next to the existing `StickyNote` placeholder-ticket icon.
