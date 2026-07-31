import { describe, expect, it } from 'vitest'
import { effectiveDueDate, groupLabel, localTodayISO, matchesDateRange } from './dateAgenda'

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

  describe('effectiveDueDate', () => {
    it('returns null when there is no dueDate and no office link', () => {
      expect(effectiveDueDate({ dueDate: null, officeLinked: false }, null, today)).toBeNull()
    })

    it('returns the real dueDate when set, ignoring any office link', () => {
      expect(
        effectiveDueDate({ dueDate: '2026-07-30', officeLinked: true }, '2026-08-01', today),
      ).toBe('2026-07-30')
    })

    it('returns nextOfficeDay for an office-linked todo with no dueDate', () => {
      expect(
        effectiveDueDate({ dueDate: null, officeLinked: true }, '2026-07-28', today),
      ).toBe('2026-07-28')
    })

    it('ignores nextOfficeDay when the todo is not office-linked', () => {
      expect(
        effectiveDueDate({ dueDate: null, officeLinked: false }, '2026-07-28', today),
      ).toBeNull()
    })

    it('treats a stale (past) office day as no date, not overdue', () => {
      expect(
        effectiveDueDate({ dueDate: null, officeLinked: true }, '2026-07-20', today),
      ).toBeNull()
    })

    it('still counts an office day that is exactly today', () => {
      expect(effectiveDueDate({ dueDate: null, officeLinked: true }, today, today)).toBe(today)
    })
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

  describe('matchesDateRange', () => {
    it('matches everything when the range is null', () => {
      expect(matchesDateRange(null, null)).toBe(true)
      expect(matchesDateRange('2026-07-25', null)).toBe(true)
    })

    it('never matches a null due date against a real range', () => {
      expect(matchesDateRange(null, { start: '2026-07-01', end: '2026-07-31' })).toBe(false)
    })

    it('matches a due date inside a multi-day range', () => {
      expect(matchesDateRange('2026-07-15', { start: '2026-07-01', end: '2026-07-31' })).toBe(true)
    })

    it('includes both boundary ends of the range', () => {
      const range = { start: '2026-07-10', end: '2026-07-20' }
      expect(matchesDateRange('2026-07-10', range)).toBe(true)
      expect(matchesDateRange('2026-07-20', range)).toBe(true)
    })

    it('excludes a due date outside the range on either side', () => {
      const range = { start: '2026-07-10', end: '2026-07-20' }
      expect(matchesDateRange('2026-07-09', range)).toBe(false)
      expect(matchesDateRange('2026-07-21', range)).toBe(false)
    })

    it('matches a single-day range only on that exact day', () => {
      const range = { start: '2026-07-15', end: '2026-07-15' }
      expect(matchesDateRange('2026-07-15', range)).toBe(true)
      expect(matchesDateRange('2026-07-14', range)).toBe(false)
      expect(matchesDateRange('2026-07-16', range)).toBe(false)
    })
  })
})
