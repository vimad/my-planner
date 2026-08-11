import { describe, expect, it } from 'vitest'
import { computeWorkingDates, computeWorkingDays } from '../src/services/sprintWorkingDays.ts'

describe('computeWorkingDays', () => {
  it('counts a plain Mon-Fri range with no holidays as 5', () => {
    // 2026-08-03 is a Monday, 2026-08-07 is a Friday.
    expect(computeWorkingDays('2026-08-03', '2026-08-07', [])).toBe(5)
  })

  it('excludes Saturday and Sunday from a range spanning a full weekend', () => {
    // 2026-08-03 (Mon) through 2026-08-09 (Sun) - 5 weekdays, 2 weekend days.
    expect(computeWorkingDays('2026-08-03', '2026-08-09', [])).toBe(5)
  })

  it('excludes a holiday that falls on a weekday inside the range', () => {
    // 2026-08-03..07 (Mon-Fri) minus one weekday holiday (Wed 08-05) = 4.
    expect(computeWorkingDays('2026-08-03', '2026-08-07', ['2026-08-05'])).toBe(4)
  })

  it('treats a holiday on a weekend, or outside the range, as a no-op', () => {
    // 2026-08-08 is a Saturday (already excluded); 2026-08-20 is outside
    // the range entirely - neither should double-subtract or error.
    expect(computeWorkingDays('2026-08-03', '2026-08-09', ['2026-08-08', '2026-08-20'])).toBe(5)
  })

  it('counts a single-day weekday range as 1', () => {
    expect(computeWorkingDays('2026-08-03', '2026-08-03', [])).toBe(1)
  })

  it('returns 0 for an inverted/invalid range (endDate < startDate)', () => {
    expect(computeWorkingDays('2026-08-07', '2026-08-03', [])).toBe(0)
  })

  it('returns 0, not negative, when every weekday in the range is also marked a holiday', () => {
    expect(computeWorkingDays('2026-08-03', '2026-08-07', ['2026-08-03', '2026-08-04', '2026-08-05', '2026-08-06', '2026-08-07'])).toBe(0)
  })
})

describe('computeWorkingDates', () => {
  it('returns the actual date list for a plain Mon-Fri range with no holidays', () => {
    expect(computeWorkingDates('2026-08-03', '2026-08-07', [])).toEqual([
      '2026-08-03',
      '2026-08-04',
      '2026-08-05',
      '2026-08-06',
      '2026-08-07',
    ])
  })

  it('excludes Saturday and Sunday from a range spanning a full weekend', () => {
    expect(computeWorkingDates('2026-08-03', '2026-08-09', [])).toEqual([
      '2026-08-03',
      '2026-08-04',
      '2026-08-05',
      '2026-08-06',
      '2026-08-07',
    ])
  })

  it('excludes a holiday that falls on a weekday inside the range', () => {
    expect(computeWorkingDates('2026-08-03', '2026-08-07', ['2026-08-05'])).toEqual([
      '2026-08-03',
      '2026-08-04',
      '2026-08-06',
      '2026-08-07',
    ])
  })

  it('returns [] for an inverted/invalid range (endDate < startDate)', () => {
    expect(computeWorkingDates('2026-08-07', '2026-08-03', [])).toEqual([])
  })

  it('agrees with computeWorkingDays across a handful of inputs', () => {
    const cases: [string, string, string[]][] = [
      ['2026-08-03', '2026-08-07', []],
      ['2026-08-03', '2026-08-09', []],
      ['2026-08-03', '2026-08-07', ['2026-08-05']],
      ['2026-08-03', '2026-08-09', ['2026-08-08', '2026-08-20']],
      ['2026-08-03', '2026-08-03', []],
      ['2026-08-07', '2026-08-03', []],
      ['2026-08-03', '2026-08-07', ['2026-08-03', '2026-08-04', '2026-08-05', '2026-08-06', '2026-08-07']],
    ]
    for (const [startDate, endDate, holidays] of cases) {
      expect(computeWorkingDates(startDate, endDate, holidays).length).toBe(computeWorkingDays(startDate, endDate, holidays))
    }
  })
})
