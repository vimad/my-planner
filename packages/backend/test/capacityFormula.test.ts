import { describe, expect, it } from 'vitest'
import { computeCapacity } from '../src/services/capacityFormula.ts'

describe('computeCapacity', () => {
  it('reconciles the reference spreadsheet worked example: a 10-day sprint with 1 day of leave gives Total = 72', () => {
    const result = computeCapacity({
      workingDays: 10,
      leaveDays: 1,
      effectivePercentage: 80,
      planned: 0,
      lookupRows: [],
    })

    expect(result.total).toBe(72)
  })

  it('uses the matching CapacityLookup row for (percentage, effectiveDays) when one exists', () => {
    const result = computeCapacity({
      workingDays: 10,
      leaveDays: 1, // effectiveDays = 72 / 8 = 9
      effectivePercentage: 80,
      planned: 20,
      lookupRows: [
        { percentage: 80, days: 9, hours: 58 },
        { percentage: 50, days: 9, hours: 36 },
      ],
    })

    expect(result.available).toBe(58)
    expect(result.remaining).toBe(38)
  })

  it('falls back to Total x (effectivePercentage / 100) when no CapacityLookup row matches', () => {
    const result = computeCapacity({
      workingDays: 10,
      leaveDays: 1, // Total = 72, effectiveDays = 9
      effectivePercentage: 80,
      planned: 20,
      lookupRows: [{ percentage: 50, days: 9, hours: 36 }], // no row for (80, 9)
    })

    expect(result.available).toBe(72 * 0.8)
    expect(result.remaining).toBe(72 * 0.8 - 20)
  })

  it('defaults to zero leave, computing Total purely from workingDays x 8', () => {
    const result = computeCapacity({
      workingDays: 8,
      leaveDays: 0,
      effectivePercentage: 80,
      planned: 0,
      lookupRows: [],
    })

    expect(result.total).toBe(64)
  })

  it('defaults to zero planned, leaving Remaining equal to Available', () => {
    const result = computeCapacity({
      workingDays: 10,
      leaveDays: 0,
      effectivePercentage: 50,
      planned: 0,
      lookupRows: [],
    })

    expect(result.remaining).toBe(result.available)
  })
})
