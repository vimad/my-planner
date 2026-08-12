// Sprint Planning Gantt Chart — leave/holiday shading (wayfinder ticket 08,
// .scratch/sprint-gantt-chart/issues/08-leave-shading-and-devqa-linking.md).
// Pure "capacity + holidays -> one 1-day sibling-task descriptor per
// leave/holiday day" builder, same posture as ganttPlacement.ts (frontend-
// only math, no side effects, directly unit-testable). Per ticket 01's
// confirmed approach, SVAR's `highlightTime` hook is global/per-column only
// (no row/resource argument), so per-person shading can't go through it -
// instead SprintGanttChart.tsx renders each of these as an ordinary 1-day
// child task under the person's row, styled entirely via the `key` (SVAR's
// `data-id`) prefix rather than any bar-level color prop.

import { getId } from './getId'
import type { LeavePortion, SprintCapacity, TeamMembership } from '../types'

export interface GanttLeaveDay {
  // Deterministic id, always starting with `leave-full-` or `leave-half-` so
  // SprintGanttChart.tsx's CSS can target both a leave day and a holiday day
  // of the same portion with one selector (ticket's "full-leave and holiday
  // days render in red-400/500" bullet - holidays are just always-full).
  key: string
  membershipId: string
  date: string
  portion: LeavePortion
  label: 'Leave' | 'Holiday'
}

// One person's real recorded leave (from their own SprintCapacity.leaveEntries
// - already reconciled against the sprint's working dates server-side, see
// routes/capacity.ts) plus the sprint-wide TeamSprintPlan.holidays, applied
// to every membership's row regardless of whether that person has a
// SprintCapacity record yet (mirrors SprintGanttChart.tsx's own person-row
// loop, which also doesn't gate on capacity presence).
export function buildLeaveDays(memberships: TeamMembership[], capacity: SprintCapacity[], holidays: string[]): GanttLeaveDay[] {
  const capacityByMembershipId = new Map(capacity.map((c) => [c.teamMembershipId, c]))
  const days: GanttLeaveDay[] = []

  for (const membership of memberships) {
    const membershipId = getId(membership) ?? ''

    const personCapacity = capacityByMembershipId.get(membershipId)
    if (personCapacity) {
      for (const entry of personCapacity.leaveEntries) {
        days.push({
          key: `leave-${entry.portion}-leave-${membershipId}-${entry.date}`,
          membershipId,
          date: entry.date,
          portion: entry.portion,
          label: 'Leave',
        })
      }
    }

    for (const date of holidays) {
      days.push({
        key: `leave-full-holiday-${membershipId}-${date}`,
        membershipId,
        date,
        portion: 'full',
        label: 'Holiday',
      })
    }
  }

  return days
}
