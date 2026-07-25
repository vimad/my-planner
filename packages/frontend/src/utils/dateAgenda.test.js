import { describe, expect, it } from 'vitest'
import { groupLabel, localTodayISO } from './dateAgenda'

describe('dateAgenda', () => {
  const today = '2026-07-25'

  it('groups a null due date as "No date"', () => {
    expect(groupLabel(null, today)).toBe('No date')
  })

  it('groups a past due date as "Overdue"', () => {
    expect(groupLabel('2026-07-24', today)).toBe('Overdue')
    expect(groupLabel('2026-07-01', today)).toBe('Overdue')
  })

  it('groups the exact today string as "Today"', () => {
    expect(groupLabel('2026-07-25', today)).toBe('Today')
  })

  it('groups the next calendar day as "Tomorrow"', () => {
    expect(groupLabel('2026-07-26', today)).toBe('Tomorrow')
  })

  it('groups 2-7 days out as "This week"', () => {
    expect(groupLabel('2026-07-27', today)).toBe('This week')
    expect(groupLabel('2026-08-01', today)).toBe('This week')
  })

  it('groups more than 7 days out as "Later"', () => {
    expect(groupLabel('2026-08-02', today)).toBe('Later')
    expect(groupLabel('2026-12-25', today)).toBe('Later')
  })

  it('handles a month rollover across a short month correctly', () => {
    // Jan 28 + up to 7 days should stay correctly grouped across the Jan/Feb
    // boundary — a regression check for any UTC/local parsing drift.
    expect(groupLabel('2026-02-02', '2026-01-28')).toBe('This week')
  })

  describe('localTodayISO', () => {
    it('computes the date from local year/month/date parts, not toISOString', () => {
      // 11:30pm local on July 25 — Date#toISOString() would render this as
      // "2026-07-26" in any timezone behind UTC, which is exactly the bug
      // this helper must avoid.
      const date = new Date(2026, 6, 25, 23, 30)
      expect(localTodayISO(date)).toBe('2026-07-25')
    })

    it('pads single-digit months and days', () => {
      const date = new Date(2026, 0, 5)
      expect(localTodayISO(date)).toBe('2026-01-05')
    })
  })
})
