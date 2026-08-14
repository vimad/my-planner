import { describe, expect, it } from 'vitest'
import { buildSprintExportRows, buildSprintExportSheetData, computeRoleGroupTotals } from './sprintExport'
import type { Person, PlaceholderTicket, SprintCapacity, SprintPlanEntry, TeamMembership, Ticket } from '../types'
import type { SprintPeriod } from '../hooks/useSprintPlan'

const vinod: Person = { _id: 'p1', name: 'Vinod', email: 'vinod@example.com', jiraAccountId: 'acc-vinod' }
const asini: Person = { _id: 'p2', name: 'Asini', email: 'asini@example.com', jiraAccountId: 'acc-asini' }

const tlMembership: TeamMembership = { _id: 'm1', teamId: 't1', personId: vinod, role: 'TL', capacityPercentOverride: null }
const qaMembership: TeamMembership = { _id: 'm2', teamId: 't1', personId: asini, role: 'QA', capacityPercentOverride: null }
const memberships: TeamMembership[] = [tlMembership, qaMembership]

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

function nonSplitEntry(id: string, t: Ticket, plannedHours: number, assigneeAccountId: string): SprintPlanEntry {
  return {
    _id: id,
    teamId: 't1',
    sprintId: 's1',
    ticketId: { ...t, assigneeAccountId },
    order: 0,
    devOrder: null,
    qaOrder: null,
    estimateHours: plannedHours,
    planHours: null,
    spillHours: null,
    plannedHours,
  }
}

const capacity: SprintCapacity[] = [
  {
    teamMembershipId: 'm1',
    personId: 'p1',
    personName: 'Vinod',
    role: 'TL',
    capacityPercentOverride: null,
    effectivePercentage: 50,
    leaveDays: 1,
    extraHours: 0,
    capacityEntryId: null,
    leaveEntries: [{ date: '2026-08-18', portion: 'full' }],
    total: 72,
    available: 40,
    planned: 12,
    remaining: 28,
  },
  {
    teamMembershipId: 'm2',
    personId: 'p2',
    personName: 'Asini',
    role: 'QA',
    capacityPercentOverride: null,
    effectivePercentage: 80,
    leaveDays: 0,
    extraHours: 0,
    capacityEntryId: null,
    leaveEntries: [],
    total: 80,
    available: 64,
    planned: 64,
    remaining: 0,
  },
]

// e1/e3 are actually planned this sprint (Planned > 0); e2/e4 are fully
// spilled (Plan minus Spill = 0, ADR ".scratch/sprint-plan-spill-estimate")
// - one for the Dev-role person (Vinod, TL), one for the QA-role person
// (Asini, QA), so both spill columns get exercised.
const entries: SprintPlanEntry[] = [
  nonSplitEntry('e1', ticket({ jiraKey: 'WOSMVP-100' }), 12, 'acc-vinod'),
  nonSplitEntry('e2', ticket({ jiraKey: 'WOSMVP-200' }), 0, 'acc-vinod'),
  nonSplitEntry('e3', ticket({ jiraKey: 'WOSMVP-300' }), 8, 'acc-asini'),
  nonSplitEntry('e4', ticket({ jiraKey: 'WOSMVP-400' }), 0, 'acc-asini'),
]

const placeholders: PlaceholderTicket[] = [
  { _id: 'ph1', teamId: 't1', sprintId: 's1', personId: 'p2', text: 'on-call', estimateHours: 4 },
]

describe('buildSprintExportRows', () => {
  it('maps each membership to its capacity figures and role', () => {
    const rows = buildSprintExportRows(memberships, capacity, entries, placeholders)
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({ role: 'TL', name: 'Vinod', leaveDays: 1, total: 72, available: 40, planned: 12, remaining: 28 })
    expect(rows[1]).toMatchObject({ role: 'QA', name: 'Asini', leaveDays: 0, total: 80, available: 64, planned: 64, remaining: 0 })
  })

  it('formats each person\'s planned tickets and placeholders as NUMBER(duration), with the Jira project prefix stripped', () => {
    const rows = buildSprintExportRows(memberships, capacity, entries, placeholders)
    expect(rows[0].ticketSummary).toBe('100(1d4h)')
    expect(rows[1].ticketSummary).toBe('300(1d), on-call(4h)')
  })

  it('routes a 0-planned-hours placement to devSpills/qaSpills (prefix-stripped ticket number only) instead of ticketSummary', () => {
    const rows = buildSprintExportRows(memberships, capacity, entries, placeholders)
    expect(rows[0].ticketSummary).not.toContain('200')
    expect(rows[0].devSpills).toBe('200')
    expect(rows[0].qaSpills).toBe('')

    expect(rows[1].ticketSummary).not.toContain('400')
    expect(rows[1].qaSpills).toBe('400')
    expect(rows[1].devSpills).toBe('')
  })

  it('never routes a placeholder ticket to a spill column, even with a 0-hour estimate', () => {
    const zeroHourPlaceholder: PlaceholderTicket[] = [
      { _id: 'ph2', teamId: 't1', sprintId: 's1', personId: 'p1', text: 'stub', estimateHours: 0 },
    ]
    const rows = buildSprintExportRows(memberships, capacity, [], zeroHourPlaceholder)
    expect(rows[0].ticketSummary).toBe('stub(0h)')
    expect(rows[0].devSpills).toBe('')
  })

  it('leaves the ticket summary and spill columns blank for a person with nothing planned', () => {
    const rows = buildSprintExportRows(memberships, capacity, [], [])
    expect(rows[0]).toMatchObject({ ticketSummary: '', devSpills: '', qaSpills: '' })
    expect(rows[1]).toMatchObject({ ticketSummary: '', devSpills: '', qaSpills: '' })
  })

  it('falls back to zeroed figures when a membership has no matching capacity row', () => {
    const rows = buildSprintExportRows(memberships, [], [], [])
    expect(rows[0]).toMatchObject({ total: 0, available: 0, planned: 0, remaining: 0, leaveDays: 0 })
  })
})

describe('computeRoleGroupTotals', () => {
  it('sums Available/Remaining (hours) separately across dev vs qa roles, then converts to days (/8)', () => {
    const rows = buildSprintExportRows(memberships, capacity, entries, placeholders)
    const totals = computeRoleGroupTotals(rows)
    expect(totals).toEqual([
      { label: 'Total Dev', availableDays: 5, remainingDays: 3.5 },
      { label: 'Total QA', availableDays: 8, remainingDays: 0 },
    ])
  })
})

describe('buildSprintExportSheetData', () => {
  const period: SprintPeriod = { startDate: '2026-08-10', endDate: '2026-08-21', holidays: ['2026-08-17'], workingDays: 10 }

  function findRow(sheet: (string | number)[][], firstCell: string): (string | number)[] | undefined {
    return sheet.find((row) => row[0] === firstCell)
  }

  it('includes the header row with the two spill columns', () => {
    const sheet = buildSprintExportSheetData(memberships, capacity, entries, placeholders, period)
    expect(sheet[0]).toEqual([
      'Role',
      'Name',
      'Leave',
      'Total',
      'Available',
      'Planned',
      'Remaining',
      'Remaining tickets (this sprint)',
      'Dev spills',
      'QA spills',
    ])
  })

  it('puts each person\'s planned tickets and spilled tickets in the right columns, prefix stripped', () => {
    const sheet = buildSprintExportSheetData(memberships, capacity, entries, placeholders, period)
    expect(sheet[1]).toEqual(['TL', 'Vinod', 1, 72, 40, 12, 28, '100(1d4h)', '200', ''])
    expect(sheet[2]).toEqual(['QA', 'Asini', 0, 80, 64, 64, 0, '300(1d), on-call(4h)', '', '400'])
  })

  it('includes group totals (in days), period summary, and breakdown rows', () => {
    const sheet = buildSprintExportSheetData(memberships, capacity, entries, placeholders, period)

    expect(findRow(sheet, 'Total Dev (days)')).toEqual(['Total Dev (days)', '', '', '', 5, '', 3.5, '', '', ''])
    expect(findRow(sheet, 'Total QA (days)')).toEqual(['Total QA (days)', '', '', '', 8, '', 0, '', '', ''])
    expect(findRow(sheet, 'Total No. of days')).toEqual(['Total No. of days', 12])
    expect(findRow(sheet, 'Total No. of holidays')).toEqual(['Total No. of holidays', 1])
    expect(findRow(sheet, 'Total No. of Sprint days')).toEqual(['Total No. of Sprint days', 10])
    expect(findRow(sheet, 'Sprint Breakdown')).toBeDefined()
    expect(findRow(sheet, 'Type')).toEqual(['Type', 'Duration', 'Percent'])
  })

  it('formats breakdown durations as "Xd Yh" instead of raw hours', () => {
    // Entries e1 (12h, dev-role TL) and e2 (0h spilled, excluded from the
    // breakdown entirely by rolePlannedHours) are both Task-type ("Technical
    // items" bucket, sprintBreakdown.ts's bucketFor) - 12h credited, so the
    // Technical items row and the Total row both read "1d 4h".
    const sheet = buildSprintExportSheetData(memberships, capacity, entries, placeholders, period)
    expect(findRow(sheet, 'Technical items')).toEqual(['Technical items', '1d 4h', '100%'])
    expect(findRow(sheet, 'Total')).toEqual(['Total', '1d 4h', '100%'])
  })

  it('sums the breakdown percentages to 100 across the three buckets plus the total row', () => {
    const sheet = buildSprintExportSheetData(memberships, capacity, entries, placeholders, period)
    const breakdownStart = sheet.findIndex((row) => row[0] === 'Type') + 1
    const bucketRows = sheet.slice(breakdownStart, breakdownStart + 3)
    const percentSum = bucketRows.reduce((total, row) => total + parseInt(String(row[2]), 10), 0)
    expect(percentSum).toBe(100)
  })

  it('omits the period summary rows when no sprint period is set', () => {
    const sheet = buildSprintExportSheetData(memberships, capacity, entries, placeholders, null)
    expect(findRow(sheet, 'Total No. of days')).toBeUndefined()
  })
})
