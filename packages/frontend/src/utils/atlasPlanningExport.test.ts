import { describe, expect, it } from 'vitest'
import { buildAtlasPlanningExportRows, buildAtlasPlanningExportSheetData } from './atlasPlanningExport'
import type { AtlasPlanningEntry, AtlasPlanningLeaveMark, AtlasRosterMember } from '../types'

function member(id: string, name: string): AtlasRosterMember {
  return {
    _id: id,
    personId: { _id: `p-${id}`, name, email: `${name.toLowerCase()}@example.com`, jiraAccountId: `acc-${id}` },
    createdAt: '2026-08-01T00:00:00.000Z',
  }
}

function entry(id: string, rosterMemberId: string, jiraKey: string): AtlasPlanningEntry {
  return { _id: id, rosterMemberId, jiraKey, startDate: null, endDate: null }
}

function leave(id: string, rosterMemberId: string, date: string, portion: 'full' | 'half'): AtlasPlanningLeaveMark {
  return { _id: id, rosterMemberId, date, portion }
}

const alice = member('m1', 'Alice')
const bob = member('m2', 'Bob')
const roster: AtlasRosterMember[] = [alice, bob]

describe('buildAtlasPlanningExportRows', () => {
  it('maps each roster member to their name, in roster order', () => {
    const rows = buildAtlasPlanningExportRows(roster, [], [])
    expect(rows.map((r) => r.name)).toEqual(['Alice', 'Bob'])
  })

  it('comma-joins multiple attached ticket keys for a person', () => {
    const entries = [entry('e1', 'm1', 'WOSMVP-100'), entry('e2', 'm1', 'WOSMVP-200')]
    const rows = buildAtlasPlanningExportRows(roster, entries, [])
    expect(rows[0].ticketKeys).toBe('WOSMVP-100, WOSMVP-200')
  })

  it('leaves the ticket column blank for a person with none attached', () => {
    const entries = [entry('e1', 'm1', 'WOSMVP-100')]
    const rows = buildAtlasPlanningExportRows(roster, entries, [])
    expect(rows[1].ticketKeys).toBe('')
  })

  it('only attributes each entry to its own rosterMemberId', () => {
    const entries = [entry('e1', 'm1', 'WOSMVP-100'), entry('e2', 'm2', 'WOSMVP-200')]
    const rows = buildAtlasPlanningExportRows(roster, entries, [])
    expect(rows[0].ticketKeys).toBe('WOSMVP-100')
    expect(rows[1].ticketKeys).toBe('WOSMVP-200')
  })

  it('sums leave-day count as full=1, half=0.5, and lists the dates with their portion', () => {
    const leaveMarks = [leave('l1', 'm1', '2026-08-24', 'full'), leave('l2', 'm1', '2026-08-26', 'half')]
    const rows = buildAtlasPlanningExportRows(roster, [], leaveMarks)
    expect(rows[0].leaveDayCount).toBe(1.5)
    expect(rows[0].leaveDates).toBe('2026-08-24 (full), 2026-08-26 (half)')
  })

  it('leaves leave-day count at 0 and leaveDates blank for a person with no leave marks', () => {
    const leaveMarks = [leave('l1', 'm1', '2026-08-24', 'full')]
    const rows = buildAtlasPlanningExportRows(roster, [], leaveMarks)
    expect(rows[1]).toMatchObject({ leaveDayCount: 0, leaveDates: '' })
  })

  it('returns an empty array for an empty roster', () => {
    const rows = buildAtlasPlanningExportRows([], [entry('e1', 'm1', 'WOSMVP-100')], [leave('l1', 'm1', '2026-08-24', 'full')])
    expect(rows).toEqual([])
  })
})

describe('buildAtlasPlanningExportSheetData', () => {
  it('includes the header row followed by one row per roster member', () => {
    const entries = [entry('e1', 'm1', 'WOSMVP-100')]
    const leaveMarks = [leave('l1', 'm2', '2026-08-24', 'half')]
    const sheet = buildAtlasPlanningExportSheetData(roster, entries, leaveMarks)

    expect(sheet[0]).toEqual(['Person', 'Attached tickets', 'Leave days', 'Leave dates'])
    expect(sheet[1]).toEqual(['Alice', 'WOSMVP-100', 0, ''])
    expect(sheet[2]).toEqual(['Bob', '', 0.5, '2026-08-24 (half)'])
  })

  it('prefixes the sheet with a "Window: start to end" row when windowDates is passed', () => {
    const windowDates = ['2026-08-22', '2026-08-23', '2026-08-24']
    const sheet = buildAtlasPlanningExportSheetData(roster, [], [], windowDates)

    expect(sheet[0]).toEqual(['Window: 2026-08-22 to 2026-08-24'])
    expect(sheet[1]).toEqual([])
    expect(sheet[2]).toEqual(['Person', 'Attached tickets', 'Leave days', 'Leave dates'])
  })

  it('omits the window row entirely when windowDates is empty or not passed', () => {
    const sheet = buildAtlasPlanningExportSheetData(roster, [], [])
    expect(sheet[0]).toEqual(['Person', 'Attached tickets', 'Leave days', 'Leave dates'])
  })

  it('produces only the header row for an empty roster', () => {
    const sheet = buildAtlasPlanningExportSheetData([], [], [])
    expect(sheet).toEqual([['Person', 'Attached tickets', 'Leave days', 'Leave dates']])
  })
})
