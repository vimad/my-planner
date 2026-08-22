# Spec: Atlas Planning tab

Status: ready-for-agent

**Superseded (2026-08-22):** the Planning tab was reworked to be fully
board-derived instead of manually attached. Everything below describing
manual "attach a ticket by typing its key," reassign, remove, and the "zero
Jira API calls"/"no import from Atlas's epic/task stack" module-boundary
decision (user stories 6-13, 27-28; Implementation Decisions' "Ticket
attachment data," "Module boundary," "Table UI" reassign/remove bits; Out of
Scope's Jira-fetch/dev-qa bullets) no longer reflects the code. Planning
entries are now written entirely by `packages/backend/src/services/
atlasPlanningSync.ts`'s `reconcilePlanningEntries`, called after every
Board/Summary Jira sync and once by the Planning tab's own initial load: it
pulls each roster member's non-Done AtlasTasks (In Progress ordered before To
Do for a person's first seed; newly-synced tickets appended at the end of an
existing row), and drops an entry the moment its ticket reaches Done. The
only remaining manual edit on this screen is a ticket's start/end date. See
that service file's header comment and `packages/backend/src/models/
AtlasPlanningEntry.ts` for the current shape. The rest of this spec (roster
reuse, leave/holidays, rolling window, Gantt, export) is still accurate.

Source: synthesized directly from a `/to-spec` conversation, after an exploration pass over the existing Atlas and Sprint Planning code plus a short clarifying round with the user on placement, roster source, ticket data, and Gantt bar dates (all four resolved to the recommended/simpler option — see Implementation Decisions).

## Problem Statement

Atlas (the Sprint section's program-tracking tab) currently answers "what's the state of this epic's tasks?" via its Board and Summary tabs, but there's no lightweight, always-on view of "who's working on what right now, and who's off." The Sprint section's own Planning tab answers something close to that, but it's built entirely around sprint cadence — a manually-set sprint date range, per-sprint leave, a Jira backlog picker split into Product/Technical/Bug categories, and a hard dev/qa role split for Story/Bug tickets. None of that fits Atlas: Atlas has no sprint concept, no team scoping, and no dev/qa distinction — every task is just a task. The user wants a simple, people-wise planning view that lives inside Atlas, always shows a rolling two-week window instead of a picked sprint period, and is built as a fully separate module so it never has to carry Sprint Planning's sprint/backlog/dev-qa machinery.

## Solution

Add a third tab, **Planning**, to Atlas's own tab row (`Board | Summary | Planning`), right after Summary. It is a self-contained module — new frontend components/hooks/utils and new backend models/routes — that duplicates the general shape of Sprint Planning's people-wise table (one row per person, tickets attached as badges) without sharing any code, schema, or the sprint/backlog/dev-qa concepts that don't apply here.

- **Rows**: one per Atlas roster member (the same roster already used by Atlas's Board "group by assignee" and the people-management popover) — no new roster is introduced.
- **Attaching work**: a plain form — pick a person, type a Jira key, attach. No backlog browser, no Product/Technical/Bug category tabs, no fetch of the ticket's title/status/type from Jira. The badge shows only the key that was typed.
- **No dev/qa split**: every attached ticket is a single badge under a single person. There is no Story/Bug-vs-Task distinction and no per-role placement.
- **Leave & holidays**: tracked for a rolling two-week window that always starts today — never a manually picked period. The window silently advances day to day; there is nothing to "set" beyond the leave/holiday marks themselves.
- **Gantt chart**: reuses the `@svar-ui/react-gantt` library already in the codebase, fixed to the same rolling two-week window, one row per person, one bar per attached ticket. Bar position/length comes from a start/end date the user sets manually on the ticket (there's no hours/estimate field here to auto-place bars from, unlike Sprint Planning's walk-forward algorithm).
- **No Sprint Breakdown card** — that donut is specifically about Feature/Technical/Bug proportions, a classification this view doesn't have.
- **Export**: an Excel download of the current plan, following the same client-side `xlsx` pattern already used for Sprint Planning's and Todos' exports (own implementation, not shared code).

## User Stories

1. As an Atlas user, I want a "Planning" tab after "Summary" in Atlas's tab row, so that I can get to the people-wise view without leaving Atlas.
2. As an Atlas user, I want the Planning tab styled and positioned identically to the existing Board/Summary tab pills, so that it feels like a native part of Atlas rather than a bolted-on page.
3. As an Atlas user, I want the Planning tab to load its own data independently of Board/Summary, so that switching tabs doesn't wait on or interfere with epic/task data.
4. As an Atlas user, I want one row per person from Atlas's existing roster, so that I don't have to maintain a second people list just for this view.
5. As an Atlas user, when I add or remove someone from the Atlas roster, I want the Planning table to pick that up automatically, so that the roster stays in sync without extra steps.
6. As an Atlas user, I want to attach a ticket to a person by typing its Jira key, so that I can record who's working on what without hunting through a backlog picker.
7. As an Atlas user, I want the attach form to require both a person and a key before it submits, so that I can't create an orphaned or unassigned entry.
8. As an Atlas user, I want a light client-side format check on the key I type (matching this project's Jira key shape), so that an obvious typo is caught before it's saved.
9. As an Atlas user, I do **not** want the app to fetch the ticket's title/status/type from Jira, so that this view stays fast and makes zero Jira calls.
10. As an Atlas user, I want each attached ticket's badge to show just its key, so that the table stays compact and legible with many tickets.
11. As an Atlas user, I want the key to double as a link out to the ticket in Jira, so that I can jump to full details when I need them.
12. As an Atlas user, I want to remove an attached ticket from a person's row, so that I can clear out finished or miscategorized work.
13. As an Atlas user, I want to reassign an attached ticket to a different person, so that I don't have to delete and re-add it when work shifts.
14. As an Atlas user, I want the leave/holiday window to always be "today through the next 13 days," recalculated on every load, so that I never have to pick or roll forward a period myself.
15. As an Atlas user, I want to mark a specific person as on leave (full or half day) for any date inside the current two-week window, so that their availability is visible at a glance.
16. As an Atlas user, I want to mark a shared holiday date that applies to the whole roster, so that I don't have to mark the same non-working day for every person individually.
17. As an Atlas user, I want leave and holiday marks to persist by absolute date, so that a mark I made yesterday for a date still inside the window keeps showing correctly today.
18. As an Atlas user, I want a date that rolls out of the two-week window to simply stop being editable/shown, so that I never have to clean up stale leave data myself.
19. As an Atlas user, I want a Gantt chart of the current two-week window, with one row per person and one bar per attached ticket, so that I can see the shape of who's doing what over time.
20. As an Atlas user, I want to set (or drag to change) a ticket's start/end date directly, so that I control its bar position without any auto-placement guesswork.
21. As an Atlas user, I want leave and holiday days to render as shaded/colored days on the Gantt alongside the ticket bars, so that availability and workload are visible in one view.
22. As an Atlas user, I want the Gantt chart to open in a large, near-fullscreen view (like Sprint Planning's Gantt), so that I have enough room to read a two-week, multi-person timeline.
23. As an Atlas user, I want to export the current Planning table (people, their attached ticket keys, and leave days) to an Excel file, so that I can share or archive a snapshot outside the app.
24. As an Atlas user using the desktop app, I want the export to use the native save dialog instead of a browser download, so that it behaves consistently with the other exports in this app.
25. As an Atlas user, I want to see an empty state when the roster has no members or a person has no attached tickets, so that the table doesn't look broken when there's nothing to show yet.
26. As an Atlas user, I want the export button disabled (with an explanatory tooltip/title) when there's nothing to export, so that I don't produce a useless empty file.
27. As a developer maintaining this codebase, I want this feature's models, routes, components, and hooks kept in their own files/folders with no imports from Sprint Planning's `PlanningView.tsx`/`useSprintPlan.ts` or Atlas's `useAtlasEpics.ts`, so that the two Planning concepts never entangle and either can change independently.
28. As a developer, I want this feature to make no Jira API calls at all, so that it trivially satisfies the codebase's read-only-Jira rule without needing its own sync/service layer.

## Implementation Decisions

**Placement.** A third tab inside Atlas's own tab row, not a new top-level Sprint-shell tab. `AtlasView.tsx`'s existing `useState<'board' | 'summary'>('board')` becomes `useState<'board' | 'summary' | 'planning'>('board')`; add a third pill button after "Summary" using the exact same tab-row markup/classes Atlas already uses (`role="tablist"`, `rounded-full` pill wrapper, active state = the violet→fuchsia gradient). The tab is not URL-routed, same as Board/Summary today.

**Module boundary.** Entirely new frontend and backend code, deliberately not importing from either Sprint Planning (`PlanningView.tsx`, `useSprintPlan.ts`, `SprintGanttChart.tsx`, `sprintExport.ts`, the `SprintPlanEntry`/`TeamSprintPlan`/`CapacityEntry` models) or Atlas's own epic/task stack (`useAtlasEpics.ts`, `AtlasEpic`/`AtlasTask` models). Code duplication (a second Gantt wrapper, a second xlsx export builder, a second leave grid) is accepted and expected. The one exception is roster: this feature reads Atlas's existing roster.

**Roster.** Reuses `AtlasRosterMember` / `useAtlasRoster` / `useAtlasRosterPeople` as-is — no new person/roster collection. This is Atlas's own shared infrastructure (already used by the Board tab's "group by assignee"), not part of the Sprint Planning code this feature is avoiding.

**Ticket attachment data.** A new backend collection (working name `AtlasPlanningEntry`) storing just `{ rosterMemberId, jiraKey, startDate, endDate }` — `jiraKey` is the raw typed string, `startDate`/`endDate` are nullable `YYYY-MM-DD` strings (null until the user sets them via the table or the Gantt). No title, status, type, or URL is fetched or cached; the model deliberately does **not** reuse the name "Ticket," since that term is already reserved in this codebase's domain glossary (`CONTEXT.md`) for "a cached Jira issue snapshot." A Jira link can still be constructed client-side from the key alone (same URL pattern used elsewhere) without any fetch.

**Leave.** A new collection (working name `AtlasPlanningLeave`) storing `{ rosterMemberId, date, portion: 'full' | 'half' }`, unique per `(rosterMemberId, date)` — the same shape as `CapacityEntry.leaveEntries` but its own collection, since there's no per-sprint parent doc to nest it under here. No `extraHours` field — this view has no capacity/hours math at all.

**Holidays.** A new collection (working name `AtlasPlanningHoliday`) storing `{ date }`, unique per date — shared across the whole roster, mirroring the semantics of `TeamSprintPlan.holidays` but as its own standalone collection (again, no sprint-plan-header doc to hang it off).

**Rolling two-week window.** Computed at read time as `[today, today + 13 days]`, in whatever timezone convention the rest of the app's `YYYY-MM-DD` date fields already use — never persisted as a stored "period." Leave/holiday dates outside the current window simply aren't rendered or editable; nothing is deleted or archived when a date ages out, matching `CapacityEntry`'s existing "reconcile at read time, never cascade-write" convention. Table, leave grid, and Gantt chart all derive the same window independently from "today" rather than sharing a stored value.

**Table UI.** Archetype D card (per `docs/ui-conventions.md`) containing one row per roster member; each attached ticket renders as a plain, neutral `slate` badge (key text + remove icon + a small calendar affordance to set/edit its start/end date) — not the violet "Placeholder" color (that's reserved for Sprint Planning's non-Jira stand-ins) and not an issue-type color family (no type data exists here to justify one). Reassigning a ticket to a different person is a simple control on the badge/row (e.g. a person picker), not drag-and-drop between rows.

**Leave grid.** A plain table (person rows × the 14 window dates as columns), click-to-cycle none → full → half per cell, following the same interaction as Sprint Planning's `SprintLeaveGrid` (new implementation, not shared).

**Holiday picker.** A row of day-chips across the same 14 dates, toggled on/off, shared by the whole roster — same interaction as `SprintPeriodForm`'s holiday chips (new implementation, not shared).

**Gantt chart.** Reuses the `@svar-ui/react-gantt` library (already a dependency), opened in the near-fullscreen modal variant from `docs/ui-conventions.md` Archetype B (same as Sprint Planning's Gantt). One row per roster member; one child bar per attached ticket positioned from its manual `startDate`/`endDate`; leave/holiday days rendered as sibling 1-day bars with forced CSS coloring, the same faking technique `ganttLeaveDays.ts` already uses (SVAR's native per-resource calendar shading is PRO-gated) — implemented fresh, not imported. Dragging a bar autosaves its `startDate`/`endDate` via PATCH, same interaction pattern as Sprint Planning's Gantt (no Save button).

**Export.** A pure, unit-testable "build the array-of-arrays" function (person, their attached ticket keys, their leave-day count/dates within the current window) plus a thin `xlsx`-writing wrapper, following `sprintExport.ts`/`todosExport.ts`'s split exactly, including the `isTauri()` branch to use the desktop save dialog instead of a browser blob download. Own file, own component (`AtlasPlanningExportButton`), not shared with either existing exporter.

**Backend routes.** New route files mounted flat off `/api/...`, matching this codebase's REST conventions: `routes/atlasPlanningEntries.ts` (create/list/patch-dates/patch-person/delete), `routes/atlasPlanningLeave.ts` (set/clear leave), `routes/atlasPlanningHolidays.ts` (toggle a holiday date). Flat `{ error }` JSON on failure, `next(err)` funneling to the central error middleware, manual inline validation (no schema-validation library), raw Mongoose docs as the success response body — same shape as every existing route file in this codebase.

**Person removal from the roster.** Out of scope to change roster-removal behavior itself. If a roster member is removed via Atlas's existing people popover, their `AtlasPlanningEntry`/`AtlasPlanningLeave` rows are simply no longer resolvable to a visible row and stop rendering — no cascade delete, no reassignment prompt. If this proves confusing in practice, a follow-up spec can add a guard or cleanup step.

## Testing Decisions

A good test here asserts on external behavior — rendered table/Gantt/export output, API request/response shapes — not on internal component state or implementation details.

- **Backend routes** (`atlasPlanningEntries`, `atlasPlanningLeave`, `atlasPlanningHolidays`): tests in `packages/backend/test/<routeFile>.route.test.ts`, using `supertest` against a fresh `createApp()` instance with the relevant Mongoose model mocked via `vi.mock(...)` — no real database. Prior art: `packages/backend/test/atlasEpics.route.test.ts`, `atlasTasks.route.test.ts`.
- **Backend pure logic** (e.g. the rolling-window date computation, if it lives server-side): co-located under `packages/backend/test/`, not next to the source file — matching how `atlasRisk.test.ts` tests `src/utils/atlasRisk.ts`.
- **Frontend pure utils** (the export array-builder, the rolling-window computation, leave/holiday window-reconciliation logic): co-located `*.test.ts` next to the source file. Prior art: `sprintExport.test.ts`, `ganttPlacement.test.ts`.
- **Frontend components** (the Planning tab body, the table, the attach form, the leave grid, the holiday chips, the Gantt wrapper, the export button): co-located `*.test.tsx` using React Testing Library + Vitest, at the same interaction-level depth as existing Atlas/Planning tests — form validation, loading/disabled states, add/remove/reassign flows, empty states — not just render smoke tests. Prior art: `AtlasView.test.tsx`, `AtlasTaskBoard.test.tsx`, `PlanningView.test.tsx`, `SprintGanttChart.test.tsx`.
- Because this module makes zero Jira API calls, it needs no read-only-Jira-safety test coverage (unlike `atlasSync`-adjacent code, which does guard against accidental writes).

## Out of Scope

- Any sprint or team scoping — this view has neither, matching Atlas's own lack of Team scoping today.
- The "Add from backlog" picker and its Product/Technical/Bug category tabs.
- Fetching or caching a ticket's title, status, type, or URL from Jira — only the typed key is stored.
- Dev/QA role splitting, role placement, or any dev/qa grouping of tickets.
- The Sprint Breakdown donut/summary card and its Feature/Technical/Bug classification.
- Auto-placement of Gantt bars from hours/estimates — bar dates are always set manually.
- Drag-and-drop reordering of tickets within a person's row.
- Any manually picked period/date-range setting — the window is always "today through +13 days," never user-adjustable.
- Changes to how roster members are added/removed in Atlas — unchanged, existing feature.
- Any write-back to Jira (already prohibited codebase-wide by `CLAUDE.md`).
- A history/archive view of past leave, holidays, or removed tickets outside the current rolling window.

## Further Notes

- **Naming collision, accepted as-is**: this introduces a second "Planning" tab in the app (Sprint → Planning already exists). The two are disambiguated by their different parent context (Sprint shell's tab row vs. Atlas's own internal tab row), the same way "Board" already refers to two unrelated things elsewhere in this codebase (Atlas's Board tab vs. the personal planner's Kanban `Board` feature) without confusion in practice. No rename is proposed.
- **Domain glossary**: `CONTEXT.md`'s existing "Ticket" entry specifically means a cached Jira issue snapshot — this feature's attached-key concept is deliberately named and modeled differently (see Implementation Decisions) to avoid colliding with that term. Worth adding a short glossary entry for the new concept once a final name is picked during implementation.
- **Possible ADR**: the "rolling window computed at read time, never persisted" pattern is a genuinely new schema decision (contrast with `TeamSprintPlan`'s stored, manually-picked period) — worth a short ADR in `docs/adr/` in the style of the existing 0001–0006 if the implementer judges it non-obvious enough to warrant one.
- Reference `docs/ui-conventions.md` throughout for exact class strings (Archetype D card for the table, Archetype B near-fullscreen modal for the Gantt, Archetype A popover for any date-edit affordance) and `CONTEXT.md` for the existing domain vocabulary this feature deliberately does *not* reuse.
