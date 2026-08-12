# 08 — Leave/holiday shading and Dev/QA bar linking

**What to build:** Two read-only visual layers on top of Ticket 07's static Gantt render:

1. **Leave/holiday shading**, reusing `SprintLeaveGrid.tsx`'s exact color vocabulary for visual consistency: full leave/holiday = red-400/500 (`#f87171`/`#ef4444`), half leave = amber-300/500 (`#fcd34d`/`#f59e0b`). Per Ticket 01's confirmed approach: SVAR's free-tier `highlightTime` hook is global/per-column only, not per-row, so per-person shading is NOT rendered through it — instead render each leave/holiday day as an ordinary 1-day sibling task under the person's row, styled via CSS. This composes for free with the map's "overlapping bars allowed freely" decision — leave bars and ticket bars on the same row simply overlap visually. Stays strictly read-only on the Gantt; leave editing continues to happen only in `SprintLeaveGrid`.
2. **Dev/QA bar linking** for a Split ticket's two placements, even when they land on two different people's rows — a hard v1 requirement, not deferrable. Two mechanisms confirmed working together in Ticket 01's prototype: a native SVAR dependency link (`type: 's2s'` between the Dev and QA task ids, renders an elbow connector line) plus a shared border/background applied via `data-id`-keyed CSS (every rendered bar carries `data-id` verbatim from the task id — give Dev/QA placements deterministic related ids like `dev-<jiraKey>`/`qa-<jiraKey>` and target them with `[data-id^=":dev-"]`/`[data-id^=":qa-"]` selectors).

**Blocked by:** 07.

**Status:** ready-for-agent

- [ ] Full-leave and holiday days render in red-400/500 on the affected person's row, as sibling tasks (not via `highlightTime`)
- [ ] Half-leave days render in amber-300/500
- [ ] Leave/holiday shading has no click/drag affordance on the Gantt — read-only
- [ ] A Split ticket's Dev and QA bars render a visible connector line between them via a native dependency link, regardless of which two rows they land on
- [ ] A Split ticket's Dev and QA bars share a matching border/background via `data-id`-keyed CSS, distinguishable from unrelated bars
