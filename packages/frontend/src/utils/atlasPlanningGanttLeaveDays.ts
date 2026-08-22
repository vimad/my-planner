// Atlas Planning tab's Gantt chart — leave/holiday shading (.scratch/
// atlas-planning-tab, ticket 03). Pure "roster + leave marks + holidays ->
// one 1-day sibling-task descriptor per leave/holiday day" builder, same
// posture and forced-CSS-coloring technique as Sprint Planning's own
// utils/ganttLeaveDays.ts (SVAR's native per-resource calendar shading is
// PRO-gated, so per-person shading instead renders as an ordinary 1-day
// child task under the person's row, styled via its `key`/data-id prefix) -
// a fresh implementation over this feature's own AtlasPlanningLeave/
// AtlasPlanningHoliday data, not an import of ganttLeaveDays.ts or its
// SprintCapacity/TeamMembership types, per the spec's module-boundary
// decision.

import { getId } from './getId'
import type { AtlasPlanningHoliday, AtlasPlanningLeaveMark, AtlasPlanningLeavePortion, AtlasRosterMember } from '../types'

export interface AtlasPlanningGanttLeaveDay {
  // Deterministic id, always starting with `leave-full-` or `leave-half-` so
  // AtlasPlanningGanttChart.tsx's CSS can target both a leave day and a
  // holiday day of the same portion with one selector (holidays are always
  // full-day).
  key: string
  rosterMemberId: string
  date: string
  portion: AtlasPlanningLeavePortion
  label: 'Leave' | 'Holiday'
}

// One roster member's own recorded leave marks (already reconciled to the
// current rolling window server-side, see routes/atlasPlanningLeave.ts's GET)
// plus the whole-roster AtlasPlanningHoliday dates, applied to every
// member's row regardless of whether that member has any leave marks yet -
// mirrors ganttLeaveDays.ts's own per-membership loop, which also doesn't
// gate on a person having existing data.
export function buildAtlasPlanningLeaveDays(
  roster: AtlasRosterMember[],
  leaveMarks: AtlasPlanningLeaveMark[],
  holidays: AtlasPlanningHoliday[],
): AtlasPlanningGanttLeaveDay[] {
  const days: AtlasPlanningGanttLeaveDay[] = []

  for (const member of roster) {
    const rosterMemberId = getId(member) ?? ''

    for (const mark of leaveMarks) {
      if (mark.rosterMemberId !== rosterMemberId) continue
      days.push({
        key: `leave-${mark.portion}-leave-${rosterMemberId}-${mark.date}`,
        rosterMemberId,
        date: mark.date,
        portion: mark.portion,
        label: 'Leave',
      })
    }

    for (const holiday of holidays) {
      days.push({
        key: `leave-full-holiday-${rosterMemberId}-${holiday.date}`,
        rosterMemberId,
        date: holiday.date,
        portion: 'full',
        label: 'Holiday',
      })
    }
  }

  return days
}
