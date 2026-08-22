# 01 — Planning tab scaffold + people-wise ticket table

**What to build:** A third tab, "Planning," appears in Atlas's own tab row right after "Summary," styled identically to the existing Board/Summary pills. Selecting it shows a table with one row per Atlas roster member (the same roster already used by Atlas's Board "group by assignee" and the people-management popover — no new roster is introduced). A form lets the user pick a person and type a Jira key to attach it to that person's row as a plain badge showing just the key (no title/status/type fetched from Jira — zero Jira API calls in this whole ticket). Each badge links out to the ticket in Jira (URL built from the key alone), can be removed, and can be reassigned to a different person via a simple control on the badge/row. This module is entirely new code — no imports from Sprint Planning's `PlanningView.tsx`/`useSprintPlan.ts` or Atlas's `useAtlasEpics.ts`.

**Blocked by:** None — can start immediately.

- [ ] `AtlasView.tsx`'s tab state extends to include `'planning'`, with a third pill button after "Summary" using the same tab-row markup/classes (active state = violet→fuchsia gradient), not URL-routed, matching Board/Summary's existing pattern.
- [ ] New backend collection (working name `AtlasPlanningEntry`): `{ rosterMemberId, jiraKey, startDate, endDate }`, where `jiraKey` is the raw typed string and `startDate`/`endDate` are nullable `YYYY-MM-DD` strings (unused by this ticket, populated later by the Gantt ticket). The model name deliberately avoids "Ticket" per `CONTEXT.md`'s reserved meaning for that term.
- [ ] New route file mounted flat off `/api/...` (create / list / patch-person / delete), following this codebase's REST conventions: flat `{ error }` JSON on failure, `next(err)` funneling, manual inline validation, raw Mongoose docs on success.
- [ ] New frontend hook (working name `useAtlasPlanning`) fetches/mutates independently of `useAtlasEpics` — switching Board/Summary/Planning tabs never blocks on another tab's data.
- [ ] Table renders as an Archetype D card (`docs/ui-conventions.md`), one row per roster member, in roster order.
- [ ] Attach form requires both a person and a key before submitting; a light client-side format check on the key (matching this project's Jira key shape) catches an obvious typo before saving.
- [ ] Attached tickets render as plain neutral `slate` badges (not the violet "Placeholder" color, not an issue-type color family) — key text + remove icon + Jira link.
- [ ] Reassigning a badge to a different person is a control on the badge/row itself (e.g. a person picker), not drag-and-drop.
- [ ] Empty states: a roster with no members, and a person with no attached tickets, both render sensibly rather than looking broken.
- [ ] Backend route tests in `packages/backend/test/atlasPlanningEntries.route.test.ts` (supertest + `createApp()`, model mocked via `vi.mock`), matching `atlasEpics.route.test.ts`'s pattern.
- [ ] Co-located frontend component tests (React Testing Library + Vitest) at the same interaction-level depth as `AtlasView.test.tsx`/`PlanningView.test.tsx`: tab switch reveals Planning content, attach-form validation, attach/remove/reassign flows, empty states.
