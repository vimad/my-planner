# Sprint Breakdown Card — Planning Map

## Destination

An implementation-ready spec for a new **Sprint Breakdown** card in the Sprint Planning view: a Recharts pie chart (Features / Technical items / Bugs) plus a headline total-dev-estimation figure, placed to the right of a narrower "Tickets by person" table. Covers the new per-ticket Feature/Technical-item classification (a checkbox in the non-split ticket detail popup), the dev-only calculation semantics, and the card's visual design (validated via a `/prototype` session).

## Notes

- Builds directly on the `sprint-jira-integration` effort ([map](../sprint-jira-integration/map.md), [CONTEXT.md](../../CONTEXT.md)) — reuses its vocabulary (Split ticket, Role, TeamMembership, `DEV_ROLES`/`QA_ROLES`) rather than repeating it. Read `CONTEXT.md` before touching this effort's tickets.
- **Bucket mapping**: Story → Features. Bug → Bugs. Task/Sub-task/any other non-split type → Features if its `TicketFeatureOverride.isFeature` is `true`, else Technical items (default/unset = Technical item). Split-vs-non-split is the existing `isSplitTicket` check (`type === 'Story' || type === 'Bug'`, `packages/backend/src/services/devQaResolution.ts`) — nothing new there.
- **Feature classification is a global per-ticket fact**, mirroring `TicketAssigneeOverride`/`TicketDevQaOverride` exactly (`packages/backend/src/models/TicketAssigneeOverride.ts`): a new `TicketFeatureOverride` collection (`ticketId` unique ref to `Ticket`, `isFeature: boolean` default `false`, timestamps). Never touched by `ticketSync.ts`'s Full/Lightweight sync upserts, so it always wins over resync — same precedent as [ADR 0004](../../docs/adr/0004-dev-qa-override-wins-over-jira-resync.md)/[ADR 0005](../../docs/adr/0005-assignee-override-wins-over-jira-resync.md). New `PATCH /api/tickets/:ticketId/feature` route mirroring the existing assignee-override route in `routes/tickets.ts`, loaded via a new `loadFeatureOverrides` service mirroring `loadAssigneeOverrides` (`services/assigneeResolution.ts`), merged into the populated `Ticket` as `isFeature: boolean` wherever `GET /api/sprint-plan-entries` returns it. This is purely local metadata, not a Jira field — no conflict with the read-only Jira constraint (`CLAUDE.md`).
- Checkbox lives in `TicketInfoPopup.tsx` (the non-split ticket detail popup) — Split tickets (Story/Bug) never show it, since their bucket is fixed by type.
- **Placement filter**: only a placement landing on a real `TeamMembership` row whose role is a dev role (`DEV_ROLES`: TL/ATL/SSE/SE/Dev Intern) counts toward the card's totals. Unmapped, Needs dev/qa, and any ticket sitting on a QA-role person's row are excluded entirely (per "no QA role estimates" rule).
- **Per-placement hours figure** is the same one the ticket badge already displays (`rolePlannedHours`, `PlanningView.tsx`): `devPlannedHours` for a Split ticket's dev-role placement, `plannedHours` for a non-split ticket's placement. A Split ticket's qa-role placement is never counted (it's QA's own estimate, on a separate row/role).
- **Computed client-side** via `useMemo` over `entries`+`memberships`+the new `isFeature` flag already loaded by `useSprintPlan` — no new aggregate endpoint. Every mutation that already refreshes `entries` (add/remove/reorder/override/plan-spill/sync) recomputes the card for free, same reactivity pattern as `ticketsByMembershipId` in `PlanningView.tsx`.
- **Charting library: Recharts** (new dependency in `packages/frontend/package.json`) — composable SVG, themes cleanly for dark mode, minimal code for a 3-slice pie + separate legend.
- **Colors** (user-specified): Features = light green, Technical items = light blue, Bugs = light red. This matches the app's *existing* story=green/task=blue/bug=red convention already used for ticket badges (`typeColorClasses` in `PlanningView.tsx`) — reuse those hues at "light"/pale strength rather than inventing new ones. Legend is rendered separately from the pie (not inline slice labels): one row per bucket showing a color swatch, bucket name, percentage, and `(Xd Yh)` of that bucket's total dev estimate in parentheses, via the existing `formatDaysHours` utility (also used for the headline total).
- Card sits to the right of the "Tickets by person" table (`PlanningView.tsx`, the `<div className="rounded-2xl border ...">` around line 1126), which shrinks to make room.
- Consult `/prototype` for the prototype ticket. Check `docs/ui-conventions.md` before finalizing card/legend/checkbox styling.

## Decisions so far

## Not yet specified

- Whatever the prototype session's visual exploration surfaces beyond layout — empty-state treatment when no dev tickets are planned yet, exact checkbox copy/placement within `TicketInfoPopup`, percentage rounding behavior, exact table/card width split and responsive behavior. Deferred to the prototype ticket itself rather than pre-specified.

## Out of scope

- Status view showing any breakdown — the destination is Planning-view only, not requested for Status.
- Cross-team capacity/breakdown rollup — not requested.
