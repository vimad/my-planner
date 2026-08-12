import { describe, expect, it } from 'vitest'
import { clampToNextWorkingDay, computeWorkingDates, computeWorkingDays } from '../src/services/sprintWorkingDays.ts'

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

describe('clampToNextWorkingDay', () => {
  it('returns the date unchanged when it is already a valid working day within range', () => {
    // 2026-08-05 is a Wednesday, well within a Mon-Fri range with no holidays.
    expect(clampToNextWorkingDay('2026-08-05', '2026-08-03', '2026-08-07', [])).toBe('2026-08-05')
  })

  it('clamps forward past a single newly-added holiday to the next working day', () => {
    expect(clampToNextWorkingDay('2026-08-05', '2026-08-03', '2026-08-07', ['2026-08-05'])).toBe('2026-08-06')
  })

  it('clamps forward across consecutive holidays in one call', () => {
    expect(clampToNextWorkingDay('2026-08-05', '2026-08-03', '2026-08-14', ['2026-08-05', '2026-08-06', '2026-08-07'])).toBe(
      '2026-08-10',
    )
  })

  it('skips a weekend when clamping forward from a Friday holiday', () => {
    // 2026-08-07 is a Friday; 2026-08-08/09 are the following Sat/Sun.
    expect(clampToNextWorkingDay('2026-08-07', '2026-08-03', '2026-08-14', ['2026-08-07'])).toBe('2026-08-10')
  })

  it('clamps a date before a moved-later startDate up to startDate itself, when startDate is a working day', () => {
    expect(clampToNextWorkingDay('2026-07-30', '2026-08-03', '2026-08-07', [])).toBe('2026-08-03')
  })

  it('clamps a date before a moved-later startDate forward past startDate when startDate itself is now a holiday', () => {
    expect(clampToNextWorkingDay('2026-07-30', '2026-08-03', '2026-08-07', ['2026-08-03'])).toBe('2026-08-04')
  })

  it('is not bounded by endDate - walks past it when every remaining day in range is a holiday (supported spillover)', () => {
    expect(
      clampToNextWorkingDay('2026-08-05', '2026-08-03', '2026-08-07', ['2026-08-05', '2026-08-06', '2026-08-07']),
    ).toBe('2026-08-10')
  })
})
