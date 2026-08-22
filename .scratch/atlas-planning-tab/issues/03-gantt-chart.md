# 03 — Gantt chart

**What to build:** A Gantt chart for the Planning tab's current two-week window, opened in a near-fullscreen modal (Archetype B variant from `docs/ui-conventions.md`, same treatment as Sprint Planning's Gantt). One row per roster member; one child bar per attached ticket, positioned from that ticket's `startDate`/`endDate` (set/edited directly on the chart — there's no hours/estimate field here to auto-place bars from, unlike Sprint Planning's walk-forward algorithm). Leave and holiday days render as shaded sibling 1-day bars alongside the ticket bars, using the same forced-CSS-coloring technique `ganttLeaveDays.ts` already uses (SVAR's native per-resource calendar shading is PRO-gated). Dragging a bar autosaves its dates via PATCH — no Save button.

**Blocked by:** 01 (ticket data + `startDate`/`endDate` fields), 02 (leave/holiday data + the shared rolling-window utility).

- [ ] Reuses the `@svar-ui/react-gantt` library already in the codebase (own wrapper component, not shared with `SprintGanttChart.tsx`).
- [ ] Opens in the near-fullscreen modal variant (`h-full w-full` card, same backdrop/classes as the existing large-Gantt modal).
- [ ] Fixed to the same rolling two-week window computed by ticket 02's shared utility — chart, table, and leave/holiday views never disagree on what "the window" is.
- [ ] One row per roster member; one bar per attached ticket from that person's row.
- [ ] A ticket with no `startDate`/`endDate` yet gets a sensible default/placeholder position and an obvious affordance to set its dates.
- [ ] Dragging a bar's body updates `startDate`/`endDate` and autosaves on drop (PATCH to ticket 01's entry route).
- [ ] Leave/holiday days render as shaded sibling bars, sourced from ticket 02's data.
- [ ] Co-located component test(s) covering: modal opens/closes, bars render at expected positions from stub data, drag-to-reschedule triggers the expected save call, leave/holiday shading renders — matching `SprintGanttChart.test.tsx`'s depth.
