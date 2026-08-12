// Sprint Planning Gantt Chart — Dev/QA bar linking (wayfinder ticket 08,
// .scratch/sprint-gantt-chart/issues/08-leave-shading-and-devqa-linking.md).
// Pure "placed bars -> {task id renames, dependency links}" builder, mirrors
// ganttLeaveDays.ts's posture. Per ticket 01's confirmed approach, a Split
// ticket's Dev/QA pair is linked two ways at once: a native SVAR dependency
// link (`type: 's2s'`) between the two task ids, plus a `data-id`-keyed CSS
// rule matching both ids' shared `dev-`/`qa-` prefix. Both need the Dev/QA
// placements' rendered task ids to be the deterministic `dev-<jiraKey>`/
// `qa-<jiraKey>` form (not the default `bar.key`, which is keyed by the
// SprintPlanEntry's own id, unrelated to its sibling role's id) - this
// module computes the id-rename map alongside the links themselves so
// SprintGanttChart.tsx's task-building loop and the links list can never
// disagree about which id a given bar ended up with.

import type { GanttPlacedBar } from './ganttPlacement'

export interface GanttDevQaLink {
  id: string
  type: 's2s'
  source: string
  target: string
}

export interface DevQaLinkResult {
  // bar.key -> the id its rendered task should use instead, populated only
  // for a Split ticket's Dev/QA pair where BOTH roles have a rendered
  // placement (ticket 08: "for every Split-ticket entry that has both a Dev
  // and QA placement rendered") - a lone resolved role (its sibling still
  // unmapped/needs-assignment, ticket 03's exclusion) keeps its default
  // `bar.key` id and is never targeted by the dev-/qa- CSS prefix rules.
  taskIdByBarKey: Map<string, string>
  links: GanttDevQaLink[]
}

export function computeDevQaLinks(rowsByMembershipId: Map<string, GanttPlacedBar[]>): DevQaLinkResult {
  const devBarByJiraKey = new Map<string, GanttPlacedBar>()
  const qaBarByJiraKey = new Map<string, GanttPlacedBar>()

  for (const bars of rowsByMembershipId.values()) {
    for (const bar of bars) {
      // Only a Split ticket (`entry.devQa` present) has independent Dev/QA
      // placements to link - a non-split entry's single placement has
      // `role` unset and is never a link candidate.
      if (!bar.entry.devQa) continue
      if (bar.role === 'dev') devBarByJiraKey.set(bar.entry.ticketId.jiraKey, bar)
      else if (bar.role === 'qa') qaBarByJiraKey.set(bar.entry.ticketId.jiraKey, bar)
    }
  }

  const taskIdByBarKey = new Map<string, string>()
  const links: GanttDevQaLink[] = []

  for (const [jiraKey, devBar] of devBarByJiraKey) {
    const qaBar = qaBarByJiraKey.get(jiraKey)
    if (!qaBar) continue // this ticket's QA role isn't rendered (ticket 03) - no pair to link

    const devId = `dev-${jiraKey}`
    const qaId = `qa-${jiraKey}`
    taskIdByBarKey.set(devBar.key, devId)
    taskIdByBarKey.set(qaBar.key, qaId)
    links.push({ id: `link-${jiraKey}`, type: 's2s', source: devId, target: qaId })
  }

  return { taskIdByBarKey, links }
}
