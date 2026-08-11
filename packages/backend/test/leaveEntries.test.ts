import { describe, expect, it } from 'vitest'
import { clearLeave, reconcileWithWorkingDates, setLeave, totalLeaveDays } from '../src/services/leaveEntries.ts'
import type { LeaveEntry } from '../src/services/leaveEntries.ts'

describe('setLeave', () => {
  it('adds a new date entry', () => {
    expect(setLeave([], '2026-08-03', 'full')).toEqual([{ date: '2026-08-03', portion: 'full' }])
  })

  it('replaces (does not duplicate) an already-set date', () => {
    const entries: LeaveEntry[] = [{ date: '2026-08-03', portion: 'full' }]
    const next = setLeave(entries, '2026-08-03', 'half')
    expect(next).toEqual([{ date: '2026-08-03', portion: 'half' }])
  })

  it('leaves other dates untouched when setting one', () => {
    const entries: LeaveEntry[] = [{ date: '2026-08-03', portion: 'full' }]
    const next = setLeave(entries, '2026-08-04', 'half')
    expect(next).toEqual(
      expect.arrayContaining([
        { date: '2026-08-03', portion: 'full' },
        { date: '2026-08-04', portion: 'half' },
      ]),
    )
    expect(next).toHaveLength(2)
  })
})

describe('clearLeave', () => {
  it('removes an entry for a date that has one', () => {
    const entries: LeaveEntry[] = [{ date: '2026-08-03', portion: 'full' }]
    expect(clearLeave(entries, '2026-08-03')).toEqual([])
  })

  it('is a no-op when clearing a date with no entry', () => {
    const entries: LeaveEntry[] = [{ date: '2026-08-03', portion: 'full' }]
    expect(clearLeave(entries, '2026-08-04')).toEqual(entries)
  })
})

describe('totalLeaveDays', () => {
  it('returns 0 for an empty entry set', () => {
    expect(totalLeaveDays([])).toBe(0)
  })

  it('sums half (0.5) and full (1) entries correctly', () => {
    const entries: LeaveEntry[] = [
      { date: '2026-08-03', portion: 'full' },
      { date: '2026-08-04', portion: 'half' },
      { date: '2026-08-05', portion: 'half' },
    ]
    expect(totalLeaveDays(entries)).toBe(2)
  })
})

describe('reconcileWithWorkingDates', () => {
  it('drops only entries whose date is no longer a working date, leaving the rest untouched', () => {
    const entries: LeaveEntry[] = [
      { date: '2026-08-03', portion: 'full' },
      { date: '2026-08-05', portion: 'half' },
    ]
    const result = reconcileWithWorkingDates(entries, ['2026-08-03', '2026-08-04'])
    expect(result).toEqual([{ date: '2026-08-03', portion: 'full' }])
  })

  it('drops everything when the working-date list is empty', () => {
    const entries: LeaveEntry[] = [{ date: '2026-08-03', portion: 'full' }]
    expect(reconcileWithWorkingDates(entries, [])).toEqual([])
  })

  it('leaves an empty entry set as empty', () => {
    expect(reconcileWithWorkingDates([], ['2026-08-03'])).toEqual([])
  })
})
