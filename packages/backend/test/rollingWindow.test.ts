import { describe, expect, it } from 'vitest'
import { computeRollingWindowDates, ROLLING_WINDOW_LENGTH } from '../src/utils/rollingWindow.ts'

describe('computeRollingWindowDates', () => {
  it('returns 14 dates starting from the given "today" through +13 days', () => {
    const dates = computeRollingWindowDates(new Date(2026, 7, 22)) // 2026-08-22, local
    expect(dates).toHaveLength(ROLLING_WINDOW_LENGTH)
    expect(dates[0]).toBe('2026-08-22')
    expect(dates[13]).toBe('2026-09-04')
  })

  it('produces 14 consecutive, strictly increasing calendar-day strings with no duplicates', () => {
    const dates = computeRollingWindowDates(new Date(2026, 7, 22))
    expect(new Set(dates).size).toBe(14)
    for (let i = 1; i < dates.length; i++) {
      expect(dates[i] > dates[i - 1]).toBe(true)
    }
  })

  it('rolls across a month boundary correctly', () => {
    const dates = computeRollingWindowDates(new Date(2026, 0, 25)) // 2026-01-25
    expect(dates[0]).toBe('2026-01-25')
    expect(dates[dates.length - 1]).toBe('2026-02-07')
  })

  it('rolls across a year boundary correctly', () => {
    const dates = computeRollingWindowDates(new Date(2025, 11, 25)) // 2025-12-25
    expect(dates[0]).toBe('2025-12-25')
    expect(dates[dates.length - 1]).toBe('2026-01-07')
  })

  it('defaults to the real current date when no "now" is passed, never hardcoding a fixed instant internally', () => {
    const dates = computeRollingWindowDates()
    expect(dates).toHaveLength(ROLLING_WINDOW_LENGTH)
    expect(dates[0]).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})
