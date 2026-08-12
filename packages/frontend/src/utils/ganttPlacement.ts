// Sprint Planning Gantt Chart — bar placement algorithm (wayfinder ticket 04,
// .scratch/sprint-gantt-chart/issues/04-bar-placement-algorithm.md). Pure,
// frontend-only math with no side effects (ticket 04 answer #5) - the Gantt
// modal component (ticket 07) is the only real caller, but every rule below
// is unit-testable in isolation (ganttPlacement.test.ts), same posture as
// capacityFormula.ts/sprintWorkingDays.ts on the backend.
//
// Two layers:
//   - `placePersonBars` is the actual walk-forward cursor (ticket 04, one
//     cursor per person per ticket 02's row-structure decision) - takes an
//     already-resolved, already-sized list of one person's placements and
//     produces start/end dates.
//   - `computeGanttRows` is the composition: resolves entries to rows via
//     utils/ticketPlacements.ts's groupPlacementsByMembership (ticket 02's
//     merge + ticket 03's unmapped/needs-assignment exclusion), sizes each
//     placement from plannedHours (ticket 04 answer #1), and walks each
//     row's cursor via placePersonBars - the "entries, capacity, team
//     sprint plan -> placed bars" shape ticket 07 asks for.

import {
  groupPlacementsByMembership,
  overrideStartField,
  overrideStartValue,
  placementField,
  placementFieldValue,
  placementKey,
  rolePlannedHours,
} from './ticketPlacements'
import { getId } from './getId'
import type { LeaveEntry, LeavePortion, SprintCapacity, SprintPlanEntry, TeamMembership } from '../types'

// Formats a Date's LOCAL fields into "YYYY-MM-DD" - never
// Date#toISOString(), which converts through UTC and silently shifts the
// calendar day in a UTC+ environment. Same duplicated-per-file convention as
// PlanningView.tsx's and utils/sprintWorkingDates.ts's own copies of this
// exact helper (see either's header comment) - not shared even within this
// package, established precedent this file follows rather than breaks.
function toLocalDateString(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function parseLocalDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number)
  return new Date(year, month - 1, day)
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

function isWeekend(date: Date): boolean {
  const day = date.getDay() // 0 = Sunday, 6 = Saturday
  return day === 0 || day === 6
}

function isWorkingDay(date: Date, holidays: Set<string>): boolean {
  return !isWeekend(date) && !holidays.has(toLocalDateString(date))
}

// Defensive cap on the walk-forward loops below, so a pathological input
// (0% effective capacity, every remaining day zeroed) can't hang the
// browser tab - never hit by real data (ROLE_DEFAULT_CAPACITY_PERCENT's
// floor is 50%, constants/roles.ts), just a safety net.
const MAX_WALK_DAYS = 3650

// One placement's worth of walk-forward input, already sized and ordered -
// the row-wide `order`/`devOrder`/`qaOrder` shared index space (see
// ticketPlacements.ts's placementFieldValue) a row's cursor walks in.
export interface GanttPlacementItem {
  key: string
  hours: number
  order: number
  // Ticket 05/09's saved per-placement start-date override - a
  // 'YYYY-MM-DD' string when set. Always undefined/null until ticket 09
  // wires real data in; the override-aware cursor-continuation branch below
  // (ticket 04 answer #4) is implemented now regardless, per ticket 07's
  // own acceptance criterion, even though nothing exercises it with a real
  // value yet.
  overrideStart?: string | null
}

// The subset of SprintCapacity a row's cursor needs - effectivePercentage
// and the already-reconciled leaveEntries (see routes/capacity.ts: the
// backend filters a membership's stored leave against the sprint's current
// working dates on every read, so this frontend math never has to).
export interface GanttPersonCapacity {
  effectivePercentage: number
  leaveEntries: LeaveEntry[]
}

// The TeamSprintPlan fields the walk-forward needs - just the cursor's
// starting point and which calendar days are holidays. `endDate` is
// deliberately not part of this shape: the algorithm never clips at it
// (ticket 04/07: "the date axis extends past the sprint's endDate rather
// than clipping"), so nothing here needs to know where the sprint ends.
export interface GanttSprintWindow {
  startDate: string
  holidays: string[]
}

export interface GanttBar {
  key: string
  // Both 'YYYY-MM-DD'. `end` is EXCLUSIVE - the first calendar day NOT
  // consumed by this placement (the day after the last day worked),
  // matching SVAR's own ITask.start/end convention (ticket 01's API
  // specifics) so these values can be handed to the Gantt library as-is.
  start: string
  end: string
}

// Ticket 04 answer #2's flat per-day rate: a full weekend/holiday/full-leave
// day contributes 0, a half-leave day contributes half the base rate, and
// an ordinary working day contributes the full `8 * effectivePercentage /
// 100`. The CapacityLookup exception table is deliberately not consulted
// here (ticket 04 answer #2's accepted tradeoff - it encodes a whole-sprint
// total, not a daily rate, and isn't available to the frontend anyway).
function dailyRate(date: Date, holidays: Set<string>, leaveByDate: Map<string, LeavePortion>, effectivePercentage: number): number {
  if (isWeekend(date) || holidays.has(toLocalDateString(date))) return 0
  const portion = leaveByDate.get(toLocalDateString(date))
  const base = 8 * (effectivePercentage / 100)
  if (portion === 'full') return 0
  if (portion === 'half') return base / 2
  return base
}

// Walks forward from `start` (inclusive), consuming `hours` at each day's
// rate, and returns the exclusive end date. A non-positive `hours` still
// occupies a minimum one-day-wide bar rather than collapsing to a
// zero-width start===end bar (an edge case the spec doesn't address
// directly, but a zero-width bar isn't a renderable Gantt task).
function consumeForward(start: Date, hours: number, holidays: Set<string>, leaveByDate: Map<string, LeavePortion>, effectivePercentage: number): Date {
  if (hours <= 0) return addDays(start, 1)

  let remaining = hours
  let cursor = new Date(start)
  let guard = 0
  while (remaining > 0 && guard < MAX_WALK_DAYS) {
    const rate = dailyRate(cursor, holidays, leaveByDate, effectivePercentage)
    if (rate > 0) remaining -= rate
    cursor = addDays(cursor, 1)
    guard++
  }
  return cursor
}

// One person's walk-forward placement (ticket 02: one cursor per person,
// not per person-per-role - `items` already mixes that person's Dev-role
// and QA-role placements). `items` need not be pre-sorted; sorted here by
// `order` (ticket 04 answer #3: "in planning-sheet order") before walking.
export function placePersonBars(items: GanttPlacementItem[], capacity: GanttPersonCapacity, window: GanttSprintWindow): GanttBar[] {
  const holidays = new Set(window.holidays)
  const leaveByDate = new Map(capacity.leaveEntries.map((e) => [e.date, e.portion]))
  let cursor = parseLocalDate(window.startDate)

  const bars: GanttBar[] = []
  const sorted = [...items].sort((a, b) => a.order - b.order)

  for (const item of sorted) {
    if (item.overrideStart) {
      // Ticket 04 answer #4: an existing override is NOT auto-placed - its
      // start is fixed at the override, and the shared cursor jumps forward
      // to (at least) its own computed end before continuing with the next
      // not-yet-overridden placement. This "opens a gap" later auto-placed
      // bars flow around rather than through, without moving the cursor
      // backward if it's already further along than the override's end
      // (the map's "overlapping bars allowed freely" covers that case
      // instead).
      const overrideStartDate = parseLocalDate(item.overrideStart)
      const end = consumeForward(overrideStartDate, item.hours, holidays, leaveByDate, capacity.effectivePercentage)
      bars.push({ key: item.key, start: item.overrideStart, end: toLocalDateString(end) })
      if (end.getTime() > cursor.getTime()) cursor = end
      continue
    }

    // Advance the cursor to the next working day before starting this
    // placement (ticket 04 answer #3: "the cursor then advances to the
    // next working day for the next ticket") - skips weekends/holidays
    // only, not leave days (a full-leave day is still nominally a working
    // day, just zero-capacity; consumeForward below already accounts for
    // that while walking).
    let start = new Date(cursor)
    let guard = 0
    while (!isWorkingDay(start, holidays) && guard < MAX_WALK_DAYS) {
      start = addDays(start, 1)
      guard++
    }

    const end = consumeForward(start, item.hours, holidays, leaveByDate, capacity.effectivePercentage)
    bars.push({ key: item.key, start: toLocalDateString(start), end: toLocalDateString(end) })
    cursor = end
  }

  return bars
}

// A placed bar enriched with the SprintPlanEntry/role/row it belongs to -
// what the Gantt modal component (ticket 07) actually renders.
export interface GanttPlacedBar extends GanttBar {
  entry: SprintPlanEntry
  role?: 'dev' | 'qa'
  membershipId: string
}

// The full "entries, capacity, team sprint plan -> placed bars" pipeline
// ticket 07 asks for: resolves each entry to a row (ticket 02/03's
// exclusion of unmapped/needs-assignment placements happens entirely inside
// groupPlacementsByMembership, so this function never needs a "no capacity
// data" branch - ticket 03's own stated consequence for ticket 04), sizes
// each placement from plannedHours (ticket 04 answer #1), and walks each
// row's cursor independently. The per-row result is sorted by computed
// start date (ticket 02/07: a person's merged Dev/QA placements render
// sorted by start, not by raw planning-sheet order - the two only diverge
// once a saved override exists, ticket 09).
export function computeGanttRows(
  entries: SprintPlanEntry[],
  memberships: TeamMembership[],
  capacity: SprintCapacity[],
  window: GanttSprintWindow,
  overrideStartByPlacementKey: Map<string, string> = new Map(),
): Map<string, GanttPlacedBar[]> {
  const { ticketsByMembershipId } = groupPlacementsByMembership(entries, memberships)
  const capacityByMembershipId = new Map(
    capacity.map((c): [string, GanttPersonCapacity] => [c.teamMembershipId, { effectivePercentage: c.effectivePercentage, leaveEntries: c.leaveEntries }]),
  )

  const result = new Map<string, GanttPlacedBar[]>()
  for (const [membershipId, placements] of ticketsByMembershipId) {
    const personCapacity = capacityByMembershipId.get(membershipId)
    if (!personCapacity || placements.length === 0) {
      result.set(membershipId, [])
      continue
    }

    const items: GanttPlacementItem[] = placements.map((p) => ({
      key: placementKey(p),
      hours: rolePlannedHours(p.entry, p.role) ?? 0,
      order: placementFieldValue(p),
      overrideStart: overrideStartByPlacementKey.get(placementKey(p)) ?? null,
    }))
    const bars = placePersonBars(items, personCapacity, window)
    const barByKey = new Map(bars.map((b) => [b.key, b]))

    const placedBars: GanttPlacedBar[] = placements
      .map((p): GanttPlacedBar | null => {
        const bar = barByKey.get(placementKey(p))
        if (!bar) return null
        return { ...bar, entry: p.entry, role: p.role, membershipId }
      })
      .filter((b): b is GanttPlacedBar => b !== null)
      .sort((a, b) => (a.start === b.start ? a.end.localeCompare(b.end) : a.start.localeCompare(b.start)))

    result.set(membershipId, placedBars)
  }

  return result
}

// One drag-to-reschedule PATCH request body (wayfinder ticket 05/09's write-
// back composition) - `body` is sent as-is to PATCH
// /api/sprint-plan-entries/:entryId, whose only-touch-what's-present
// convention means each patch carries only the field(s) that actually
// changed for that placement.
export interface GanttDragPatch {
  entryId: string
  body: {
    order?: number
    devOrder?: number
    qaOrder?: number
    ganttStartDate?: string | null
    devGanttStartDate?: string | null
    qaGanttStartDate?: string | null
  }
}

// Ticket 09: after a drag lands `draggedKey`'s bar at `newStart`, re-runs
// ticket 04's walk-forward for just that placement's row (via the same
// groupPlacementsByMembership + placePersonBars composition
// computeGanttRows above uses) with the override now populated, then diffs
// the resulting row-wide order (the row's placements re-sorted by their
// newly-computed start date, same tiebreak as computeGanttRows's own final
// sort) against each placement's currently-stored order/devOrder/qaOrder
// value - one patch per changed placement, mirroring PlanningView's
// computeReorderPatches (PlanningView.tsx:101) "row-wide index, only patch
// what moved" pattern. The dragged placement's own patch always bundles
// both its new start-date override and its own order-field value in one
// request (Ticket 05's write-back composition) regardless of whether that
// value numerically changed; every other patch is order-only, sent only
// when that placement's row-relative position actually shifted as a side
// effect. Any placement in the row that already had a saved override before
// this drag keeps it (read straight off `p.entry` via overrideStartValue) -
// only `draggedKey`gets the new value.
export function computeDragPatches(
  entries: SprintPlanEntry[],
  memberships: TeamMembership[],
  capacity: SprintCapacity[],
  window: GanttSprintWindow,
  membershipId: string,
  draggedKey: string,
  newStart: string,
): GanttDragPatch[] {
  const { ticketsByMembershipId } = groupPlacementsByMembership(entries, memberships)
  const placements = ticketsByMembershipId.get(membershipId) ?? []

  const personCapacity = capacity.find((c) => c.teamMembershipId === membershipId)
  if (!personCapacity || placements.length === 0) return []

  const items: GanttPlacementItem[] = placements.map((p) => ({
    key: placementKey(p),
    hours: rolePlannedHours(p.entry, p.role) ?? 0,
    order: placementFieldValue(p),
    overrideStart: placementKey(p) === draggedKey ? newStart : overrideStartValue(p),
  }))

  const bars = placePersonBars(
    items,
    { effectivePercentage: personCapacity.effectivePercentage, leaveEntries: personCapacity.leaveEntries },
    window,
  )
  const barByKey = new Map(bars.map((b) => [b.key, b]))

  const sorted = [...placements].sort((a, b) => {
    const barA = barByKey.get(placementKey(a))
    const barB = barByKey.get(placementKey(b))
    if (!barA || !barB) return 0
    return barA.start === barB.start ? barA.end.localeCompare(barB.end) : barA.start.localeCompare(barB.start)
  })

  const patches: GanttDragPatch[] = []
  sorted.forEach((p, index) => {
    const key = placementKey(p)
    const isDragged = key === draggedKey
    const orderChanged = placementFieldValue(p) !== index
    if (!isDragged && !orderChanged) return

    const body: GanttDragPatch['body'] = { [placementField(p)]: index }
    if (isDragged) body[overrideStartField(p)] = newStart

    patches.push({ entryId: getId(p.entry) ?? '', body })
  })

  return patches
}
