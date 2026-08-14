import { getId } from './getId'
import type { SprintPlanEntry, TeamMembership } from '../types'

// A ticket's placement within one "Tickets by person" row. `role` is set
// only for a Split ticket's dev or qa sub-placement (CONTEXT.md "Split
// ticket") - the same SprintPlanEntry can appear as two placements, one per
// resolved role. A non-split entry has exactly one placement, `role`
// omitted.
//
// Extracted from PlanningView.tsx (originally inline there) so the Sprint
// Planning Gantt Chart's placement algorithm (utils/ganttPlacement.ts,
// wayfinder ticket 04) can reuse the exact same person-resolution logic
// PlanningView's "Tickets by person" table already uses, rather than
// re-deriving a second copy of Dev/QA-override/Assignee-override resolution
// that would have to be kept in permanent lockstep with this one.
export interface PlacedEntry {
  entry: SprintPlanEntry
  role?: 'dev' | 'qa'
}

export function placementKey(p: PlacedEntry): string {
  return `${getId(p.entry) ?? p.entry.ticketId.jiraKey}-${p.role ?? 'main'}`
}

// Which of SprintPlanEntry's three independent order namespaces (ticket 23's
// devOrder/qaOrder alongside the original order) a placement belongs to -
// see SprintPlanEntry.ts. A non-split placement (`role` unset) always uses
// `order`; a Split ticket's dev-row or qa-row placement uses only its own
// role's field.
export function placementField(p: PlacedEntry): 'order' | 'devOrder' | 'qaOrder' {
  if (p.role === 'dev') return 'devOrder'
  if (p.role === 'qa') return 'qaOrder'
  return 'order'
}

// The placement's value within its own field's namespace - but also the
// row-wide, cross-field-comparable index every placement in a row shares
// (see PlanningView.tsx's computeReorderPatches comment for why the three
// fields are one shared index space, not three independently-zeroed
// counters). This is what both PlanningView's row rendering and the Gantt's
// per-person walk-forward cursor (ticket 04 answer #3, "in planning-sheet
// order") sort by.
export function placementFieldValue(p: PlacedEntry): number {
  const field = placementField(p)
  if (field === 'devOrder') return p.entry.devOrder ?? 0
  if (field === 'qaOrder') return p.entry.qaOrder ?? 0
  return p.entry.order
}

// A role placement's own resolved Planned-this-sprint figure (spec
// ".scratch/sprint-plan-spill-estimate/spec.md") - devPlannedHours/
// qaPlannedHours (each role's own [Dev]/[Test] Sub-task Plan/Spill), never
// the parent Story/Bug's own, which a non-split placement (`role` unset)
// uses (plannedHours) instead. What PlanningView's TicketBadge displays, and
// also what the Gantt's placement algorithm sizes a bar's duration from
// (wayfinder ticket 04 answer #1 - plannedHours, never raw estimateHours).
export function rolePlannedHours(entry: SprintPlanEntry, role: 'dev' | 'qa' | undefined): number | null {
  if (role === 'dev') return entry.devPlannedHours ?? null
  if (role === 'qa') return entry.qaPlannedHours ?? null
  return entry.plannedHours ?? null
}

// Sprint Planning Gantt Chart drag-to-reschedule (wayfinder ticket 05/09) -
// which of SprintPlanEntry's three independent start-date-override fields a
// placement's saved override lives in (mirrors placementField's order/
// devOrder/qaOrder namespace pick above, one level down: a non-split
// placement always uses ganttStartDate; a Split ticket's dev-row or qa-row
// placement uses only its own role's field).
export function overrideStartField(p: PlacedEntry): 'ganttStartDate' | 'devGanttStartDate' | 'qaGanttStartDate' {
  if (p.role === 'dev') return 'devGanttStartDate'
  if (p.role === 'qa') return 'qaGanttStartDate'
  return 'ganttStartDate'
}

// The placement's own saved start-date override, or null when not
// overridden (auto-place) - what utils/ganttPlacement.ts's walk-forward
// cursor (GanttPlacementItem.overrideStart) reads per placement.
export function overrideStartValue(p: PlacedEntry): string | null {
  return p.entry[overrideStartField(p)] ?? null
}

// Keyed lookup from a current TeamMembership's own Person._id to that
// membership's id - the "resolve a person back to their roster row" half of
// groupPlacementsByMembership's resolution below, factored out since
// sprintBreakdown.ts's credit() and utils/sprintExport.ts's row-building both
// need the exact same lookup independently of the full placement grouping.
export function buildMembershipIdByPersonId(memberships: TeamMembership[]): Map<string, string> {
  return new Map(memberships.map((m) => [getId(m.personId) ?? '', getId(m) ?? '']))
}

export interface GroupedPlacements {
  ticketsByMembershipId: Map<string, PlacedEntry[]>
  unmappedPlacements: PlacedEntry[]
  needsAssignmentPlacements: PlacedEntry[]
}

// One bucket of PlacedEntry per current TeamMembership, keyed by that
// membership's Person.jiraAccountId for a non-split entry's single
// placement (ADR 0001) or by resolved Person._id for a Split entry's per-
// role placement (ticket 23's devQa) - plus two catch-all buckets:
// "unmapped" (a real, off-roster Jira assignee - CONTEXT.md "Unmapped
// assignee") and "needs dev/qa" (no resolvable assignee at all yet,
// Split-ticket roles only). A Split entry (ticket.devQa present) can land up
// to two placements across any combination of these buckets, independently
// per role; a non-split entry always has exactly one.
//
// The Sprint Planning Gantt Chart (wayfinder ticket 03) only ever wants
// `ticketsByMembershipId` - a placement that lands in `unmappedPlacements`/
// `needsAssignmentPlacements` has no real TeamMembership/SprintCapacity to
// walk a placement cursor along, so the Gantt simply never looks at those
// two buckets, same exclusion PlanningView's own catch-all rows already
// surface these through instead.
export function groupPlacementsByMembership(entries: SprintPlanEntry[], memberships: TeamMembership[]): GroupedPlacements {
  const byMembership = new Map<string, PlacedEntry[]>()
  for (const membership of memberships) {
    byMembership.set(getId(membership) ?? '', [])
  }
  const membershipIdByAccountId = new Map(memberships.map((m) => [m.personId.jiraAccountId, getId(m) ?? '']))
  const membershipIdByPersonId = buildMembershipIdByPersonId(memberships)

  const unmapped: PlacedEntry[] = []
  const needsAssignment: PlacedEntry[] = []

  function placeResolved(membershipId: string | undefined, placed: PlacedEntry) {
    // A resolved role whose personId no longer matches any current
    // TeamMembership (e.g. an Override picked someone since removed from
    // the team) has nowhere mapped to go - falls back to Unmapped rather
    // than silently vanishing from the table.
    if (membershipId && byMembership.has(membershipId)) byMembership.get(membershipId)!.push(placed)
    else unmapped.push(placed)
  }

  for (const entry of entries) {
    if (entry.devQa) {
      for (const role of ['dev', 'qa'] as const) {
        const resolution = entry.devQa[role]
        const placed: PlacedEntry = { entry, role }
        if (resolution.status === 'resolved') {
          placeResolved(membershipIdByPersonId.get(resolution.personId), placed)
        } else if (resolution.status === 'unmapped') {
          unmapped.push(placed)
        } else {
          needsAssignment.push(placed)
        }
      }
    } else {
      const placed: PlacedEntry = { entry }
      // An Assignee Override (docs/adr/0005), if set, wins over Jira's own
      // assigneeAccountId for where the badge lands - same
      // Override-wins-over-Jira precedence as a Split entry's devQa above,
      // reusing placeResolved's "stale Override -> Unmapped" fallback.
      if (entry.assigneeOverridePersonId) {
        placeResolved(membershipIdByPersonId.get(entry.assigneeOverridePersonId), placed)
      } else {
        const accountId = entry.ticketId.assigneeAccountId
        const membershipId = accountId ? membershipIdByAccountId.get(accountId) : undefined
        if (membershipId) byMembership.get(membershipId)!.push(placed)
        else unmapped.push(placed)
      }
    }
  }

  for (const placements of byMembership.values()) placements.sort((a, b) => placementFieldValue(a) - placementFieldValue(b))
  unmapped.sort((a, b) => placementFieldValue(a) - placementFieldValue(b))
  needsAssignment.sort((a, b) => placementFieldValue(a) - placementFieldValue(b))

  return { ticketsByMembershipId: byMembership, unmappedPlacements: unmapped, needsAssignmentPlacements: needsAssignment }
}
