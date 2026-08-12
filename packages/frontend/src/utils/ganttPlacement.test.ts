import { describe, expect, it } from 'vitest'
import { computeGanttRows, placePersonBars, type GanttPersonCapacity, type GanttPlacementItem, type GanttSprintWindow } from './ganttPlacement'
import type { DevQaRoleResolution, Person, SprintCapacity, SprintPlanEntry, TeamMembership, Ticket } from '../types'

// 2026-08-10 is a Monday, 2026-08-14 is a Friday - same fixture week used by
// the wayfinder ticket 01 prototype and this ticket's own spec examples.
const MONDAY = '2026-08-10'

const fullCapacity: GanttPersonCapacity = { effectivePercentage: 100, leaveEntries: [] }

const window: GanttSprintWindow = { startDate: MONDAY, holidays: [] }

describe('placePersonBars', () => {
  it('places a single item starting at the sprint start date, consuming whole days at the flat rate', () => {
    // 100% capacity -> 8h/day. 16h needs exactly two working days (Mon+Tue),
    // so the bar's exclusive end is the day after the second day consumed.
    const items: GanttPlacementItem[] = [{ key: 'a', hours: 16, order: 0 }]
    const bars = placePersonBars(items, fullCapacity, window)
    expect(bars).toEqual([{ key: 'a', start: '2026-08-10', end: '2026-08-12' }])
  })

  it('places multiple items back-to-back in order, advancing the cursor to the next working day after each', () => {
    const items: GanttPlacementItem[] = [
      { key: 'a', hours: 8, order: 0 },
      { key: 'b', hours: 8, order: 1 },
    ]
    const bars = placePersonBars(items, fullCapacity, window)
    expect(bars).toEqual([
      { key: 'a', start: '2026-08-10', end: '2026-08-11' },
      { key: 'b', start: '2026-08-11', end: '2026-08-12' },
    ])
  })

  it('processes items in `order`, not input array order', () => {
    const items: GanttPlacementItem[] = [
      { key: 'second', hours: 8, order: 1 },
      { key: 'first', hours: 8, order: 0 },
    ]
    const bars = placePersonBars(items, fullCapacity, window)
    expect(bars.map((b) => b.key)).toEqual(['first', 'second'])
    expect(bars[0]).toEqual({ key: 'first', start: '2026-08-10', end: '2026-08-11' })
    expect(bars[1]).toEqual({ key: 'second', start: '2026-08-11', end: '2026-08-12' })
  })

  it('skips weekends when walking forward mid-placement and when starting the next placement', () => {
    // Mon 8/10 - Fri 8/14 is 5 working days * 8h = 40h exactly. The next
    // item's cursor lands on Saturday and must skip the weekend to Monday.
    const items: GanttPlacementItem[] = [
      { key: 'a', hours: 40, order: 0 },
      { key: 'b', hours: 8, order: 1 },
    ]
    const bars = placePersonBars(items, fullCapacity, window)
    expect(bars[0]).toEqual({ key: 'a', start: '2026-08-10', end: '2026-08-15' }) // exclusive end = Saturday
    expect(bars[1]).toEqual({ key: 'b', start: '2026-08-17', end: '2026-08-18' }) // skips Sat 8/15, Sun 8/16
  })

  it('zeroes out a holiday day, skipping it the same way as a weekend', () => {
    const holidayWindow: GanttSprintWindow = { startDate: MONDAY, holidays: ['2026-08-11'] } // Tuesday holiday
    // 16h at 8h/day would normally take Mon+Tue; with Tue a holiday, it
    // spills to Mon+Wed instead.
    const items: GanttPlacementItem[] = [{ key: 'a', hours: 16, order: 0 }]
    const bars = placePersonBars(items, fullCapacity, holidayWindow)
    expect(bars).toEqual([{ key: 'a', start: '2026-08-10', end: '2026-08-13' }])
  })

  it('zeroes out a full-leave day, but the bar can still start on it if the cursor lands there', () => {
    const capacityWithLeave: GanttPersonCapacity = {
      effectivePercentage: 100,
      leaveEntries: [{ date: '2026-08-10', portion: 'full' }], // Monday full leave
    }
    // Monday contributes 0h; Tuesday contributes the full 8h, exhausting an
    // 8h item. The bar's start is still Monday (only weekends/holidays are
    // skipped when picking a start day, not leave days - ticket 04 answer).
    const items: GanttPlacementItem[] = [{ key: 'a', hours: 8, order: 0 }]
    const bars = placePersonBars(items, capacityWithLeave, window)
    expect(bars).toEqual([{ key: 'a', start: '2026-08-10', end: '2026-08-12' }])
  })

  it('halves the daily rate on a half-leave day', () => {
    const capacityWithHalfLeave: GanttPersonCapacity = {
      effectivePercentage: 100,
      leaveEntries: [{ date: '2026-08-10', portion: 'half' }], // Monday half leave -> 4h available
    }
    const items: GanttPlacementItem[] = [{ key: 'a', hours: 4, order: 0 }]
    const bars = placePersonBars(items, capacityWithHalfLeave, window)
    expect(bars).toEqual([{ key: 'a', start: '2026-08-10', end: '2026-08-11' }])
  })

  it('scales the flat daily rate by effectivePercentage', () => {
    const halfCapacity: GanttPersonCapacity = { effectivePercentage: 50, leaveEntries: [] }
    // 50% -> 4h/day. 8h needs two full days.
    const items: GanttPlacementItem[] = [{ key: 'a', hours: 8, order: 0 }]
    const bars = placePersonBars(items, halfCapacity, window)
    expect(bars).toEqual([{ key: 'a', start: '2026-08-10', end: '2026-08-12' }])
  })

  it('gives a zero-hour placement a minimum one-day-wide bar instead of a zero-width one', () => {
    const items: GanttPlacementItem[] = [{ key: 'a', hours: 0, order: 0 }]
    const bars = placePersonBars(items, fullCapacity, window)
    expect(bars).toEqual([{ key: 'a', start: '2026-08-10', end: '2026-08-11' }])
  })

  describe('override-aware cursor continuation (ticket 04 answer #4)', () => {
    it('places an overridden item at its fixed start, then jumps the shared cursor to max(cursor, override end) for later items', () => {
      // item "a" (order 0, no override) auto-places Mon 8/10 - Tue 8/11.
      // item "b" (order 1) has a saved override starting later, on Thu
      // 8/13, well past where item "a" left the cursor - its own bar is
      // NOT auto-placed at the cursor; it's fixed at the override, and the
      // shared cursor jumps forward to (at least) its computed end.
      // item "c" (order 2, no override) must then auto-place starting from
      // that jumped-forward cursor, not from item "a"'s original cursor.
      const items: GanttPlacementItem[] = [
        { key: 'a', hours: 8, order: 0 },
        { key: 'b', hours: 8, order: 1, overrideStart: '2026-08-13' },
        { key: 'c', hours: 8, order: 2 },
      ]
      const bars = placePersonBars(items, fullCapacity, window)
      expect(bars).toEqual([
        { key: 'a', start: '2026-08-10', end: '2026-08-11' },
        { key: 'b', start: '2026-08-13', end: '2026-08-14' }, // fixed at its override
        { key: 'c', start: '2026-08-14', end: '2026-08-15' }, // continues from b's end, not a's
      ])
    })

    it('does not move the cursor backward when an override ends before the cursor already is', () => {
      // item "a" runs Mon 8/10 through Fri 8/14 (40h). item "b" has an
      // override start of Mon 8/10 (before the cursor) with a short
      // duration ending well before item "a"'s own end - the map's
      // "overlapping bars allowed freely" applies to b vs a, but item "c"
      // (auto-placed) must still continue from the cursor's actual current
      // position (after a), not regress to b's earlier end.
      const items: GanttPlacementItem[] = [
        { key: 'a', hours: 40, order: 0 },
        { key: 'b', hours: 8, order: 1, overrideStart: '2026-08-10' },
        { key: 'c', hours: 8, order: 2 },
      ]
      const bars = placePersonBars(items, fullCapacity, window)
      expect(bars[0]).toEqual({ key: 'a', start: '2026-08-10', end: '2026-08-15' })
      expect(bars[1]).toEqual({ key: 'b', start: '2026-08-10', end: '2026-08-11' })
      // cursor after a is Sat 8/15 (skips weekend) -> Mon 8/17, unaffected
      // by b's earlier override end.
      expect(bars[2]).toEqual({ key: 'c', start: '2026-08-17', end: '2026-08-18' })
    })
  })

  it('does not hang when effectivePercentage is 0 (defensive guard against an infinite walk)', () => {
    const zeroCapacity: GanttPersonCapacity = { effectivePercentage: 0, leaveEntries: [] }
    const items: GanttPlacementItem[] = [{ key: 'a', hours: 8, order: 0 }]
    const bars = placePersonBars(items, zeroCapacity, window)
    expect(bars).toHaveLength(1)
    expect(bars[0].key).toBe('a')
  })
})

// --- computeGanttRows: the composition wiring placePersonBars together with
// the shared person-resolution/grouping (utils/ticketPlacements.ts). ---------

const ada: Person = { _id: 'p1', name: 'Ada', email: 'ada@example.com', jiraAccountId: 'acc-ada' }
const bob: Person = { _id: 'p2', name: 'Bob', email: 'bob@example.com', jiraAccountId: 'acc-bob' }

const adaMembership: TeamMembership = { _id: 'm1', teamId: 't1', personId: ada, role: 'SE', capacityPercentOverride: null }
const bobMembership: TeamMembership = { _id: 'm2', teamId: 't1', personId: bob, role: 'SE', capacityPercentOverride: null }

function ticket(overrides: Partial<Ticket> & { jiraKey: string }): Ticket {
  return {
    _id: overrides.jiraKey,
    type: 'Task',
    title: 'A ticket',
    status: 'To Do',
    assigneeAccountId: null,
    assigneeDisplayName: null,
    assigneeEmail: null,
    estimateHours: null,
    labels: [],
    stream: null,
    epicKey: null,
    parentKey: null,
    subtaskKind: null,
    currentSprintKey: null,
    lastSyncedAt: new Date().toISOString(),
    ...overrides,
  }
}

function nonSplitEntry(id: string, t: Ticket, order: number, plannedHours: number, assigneeAccountId: string | null): SprintPlanEntry {
  return {
    _id: id,
    teamId: 't1',
    sprintId: 's1',
    ticketId: { ...t, assigneeAccountId },
    order,
    devOrder: null,
    qaOrder: null,
    estimateHours: plannedHours,
    planHours: null,
    spillHours: null,
    plannedHours,
  }
}

function resolved(personId: string): DevQaRoleResolution {
  return { status: 'resolved', source: 'subtask', personId, jiraAssigneeDisplayName: null }
}
function needsAssignment(): DevQaRoleResolution {
  return { status: 'needs-assignment', jiraAssigneeDisplayName: null }
}

function splitEntry(
  id: string,
  t: Ticket,
  devQa: { dev: DevQaRoleResolution; qa: DevQaRoleResolution },
  devOrder: number,
  qaOrder: number,
  devPlannedHours: number,
  qaPlannedHours: number,
): SprintPlanEntry {
  return {
    _id: id,
    teamId: 't1',
    sprintId: 's1',
    ticketId: t,
    order: 0,
    devOrder,
    qaOrder,
    devQa,
    devEstimateHours: devPlannedHours,
    devPlanHours: null,
    devSpillHours: null,
    devPlannedHours,
    qaEstimateHours: qaPlannedHours,
    qaPlanHours: null,
    qaSpillHours: null,
    qaPlannedHours,
  }
}

function capacityFor(membership: TeamMembership): SprintCapacity {
  return {
    teamMembershipId: membership._id!,
    personId: (membership.personId as Person)._id!,
    personName: (membership.personId as Person).name,
    role: membership.role,
    capacityPercentOverride: null,
    effectivePercentage: 100,
    leaveDays: 0,
    extraHours: 0,
    capacityEntryId: null,
    leaveEntries: [],
    total: 0,
    available: 0,
    planned: 0,
    remaining: 0,
  }
}

describe('computeGanttRows', () => {
  it('places a non-split entry on its resolved assignee row, sized by plannedHours', () => {
    const t = ticket({ jiraKey: 'PROJ-1' })
    const entry = nonSplitEntry('e1', t, 0, 16, 'acc-ada')
    const rows = computeGanttRows([entry], [adaMembership], [capacityFor(adaMembership)], window)
    expect(rows.get('m1')).toEqual([{ key: 'e1-main', start: '2026-08-10', end: '2026-08-12', entry, role: undefined, membershipId: 'm1' }])
  })

  it('excludes a placement with no resolved assignee (ticket 03) - never appears on any row', () => {
    const t = ticket({ jiraKey: 'PROJ-2' })
    const entry = nonSplitEntry('e2', t, 0, 8, null) // no assigneeAccountId -> unmapped
    const rows = computeGanttRows([entry], [adaMembership], [capacityFor(adaMembership)], window)
    expect(rows.get('m1')).toEqual([])
  })

  it('excludes a Split role that is unmapped or needs-assignment, while still placing the resolved role', () => {
    const t = ticket({ jiraKey: 'PROJ-3', type: 'Story' })
    const entry = splitEntry('e3', t, { dev: resolved('p1'), qa: needsAssignment() }, 0, 0, 8, 4)
    const rows = computeGanttRows([entry], [adaMembership], [capacityFor(adaMembership)], window)
    expect(rows.get('m1')).toEqual([{ key: 'e3-dev', start: '2026-08-10', end: '2026-08-11', entry, role: 'dev', membershipId: 'm1' }])
  })

  it("merges a person's Dev-role and QA-role placements into their single row (ticket 02), sorted by computed start date", () => {
    // A split ticket's dev half lands on Bob's row (order 0), and a plain
    // ticket also lands on Bob's row later in the shared order (order 1) -
    // exercising the merge across the devOrder/order shared index space.
    const split = ticket({ jiraKey: 'PROJ-4', type: 'Story' })
    const splitTicketEntry = splitEntry('e4', split, { dev: resolved('p2'), qa: needsAssignment() }, 0, 0, 8, 4)
    const plain = ticket({ jiraKey: 'PROJ-5' })
    const plainEntry = nonSplitEntry('e5', plain, 1, 8, 'acc-bob')

    const rows = computeGanttRows([splitTicketEntry, plainEntry], [bobMembership], [capacityFor(bobMembership)], window)
    const bobRow = rows.get('m2')!
    expect(bobRow.map((b) => b.key)).toEqual(['e4-dev', 'e5-main'])
    expect(bobRow[0].start).toBe('2026-08-10')
    expect(bobRow[1].start).toBe('2026-08-11')
  })

  it('gives each membership its own independent walk-forward cursor', () => {
    const t1 = ticket({ jiraKey: 'PROJ-6' })
    const t2 = ticket({ jiraKey: 'PROJ-7' })
    const adaEntry = nonSplitEntry('e6', t1, 0, 8, 'acc-ada')
    const bobEntry = nonSplitEntry('e7', t2, 0, 8, 'acc-bob')
    const rows = computeGanttRows(
      [adaEntry, bobEntry],
      [adaMembership, bobMembership],
      [capacityFor(adaMembership), capacityFor(bobMembership)],
      window,
    )
    // Both start at the sprint start date - Bob's cursor isn't pushed
    // forward by Ada's placement.
    expect(rows.get('m1')![0].start).toBe('2026-08-10')
    expect(rows.get('m2')![0].start).toBe('2026-08-10')
  })
})
