import { describe, expect, it } from 'vitest'
import { computeCapacity } from '../src/services/capacityFormula.ts'

describe('computeCapacity', () => {
  it('reconciles the reference spreadsheet worked example: a 10-day sprint with 1 day of leave gives Total = 72', () => {
    const result = computeCapacity({
      workingDays: 10,
      leaveDays: 1,
      extraHours: 0,
      effectivePercentage: 80,
      planned: 0,
      lookupRows: [],
    })

    expect(result.total).toBe(72)
  })

  it('uses the matching CapacityLookup row for (percentage, workingDays) when one exists, then subtracts leave hours unscaled', () => {
    const result = computeCapacity({
      workingDays: 10,
      leaveDays: 1, // leaveHours = 8, subtracted straight off the row's hours
      extraHours: 0,
      effectivePercentage: 80,
      planned: 20,
      lookupRows: [
        { percentage: 80, days: 10, hours: 64 },
        { percentage: 50, days: 10, hours: 40 },
      ],
    })

    expect(result.available).toBe(64 - 8)
    expect(result.remaining).toBe(64 - 8 - 20)
  })

  it('falls back to (workingDays x 8 x effectivePercentage / 100) minus leave hours when no CapacityLookup row matches', () => {
    const result = computeCapacity({
      workingDays: 10,
      leaveDays: 1, // leaveHours = 8
      extraHours: 0,
      effectivePercentage: 80,
      planned: 20,
      lookupRows: [{ percentage: 50, days: 10, hours: 40 }], // no row for (80, 10)
    })

    expect(result.available).toBe(10 * 8 * 0.8 - 8)
    expect(result.remaining).toBe(10 * 8 * 0.8 - 8 - 20)
  })

  it('subtracts a half leave day as 4h off Available, unscaled by effectivePercentage', () => {
    const result = computeCapacity({
      workingDays: 10,
      leaveDays: 0.5,
      extraHours: 0,
      effectivePercentage: 50, // a low percentage would halve an 8h leave day to 4h under the old (buggy) scaling - it must not
      planned: 0,
      lookupRows: [],
    })

    expect(result.available).toBe(10 * 8 * 0.5 - 4)
  })

  it('defaults to zero leave, computing Total purely from workingDays x 8', () => {
    const result = computeCapacity({
      workingDays: 8,
      leaveDays: 0,
      extraHours: 0,
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
      extraHours: 0,
      effectivePercentage: 50,
      planned: 0,
      lookupRows: [],
    })

    expect(result.remaining).toBe(result.available)
  })

  it('subtracts extraHours off Available unscaled, the same way a leave day is, and never touches Total', () => {
    const result = computeCapacity({
      workingDays: 10,
      leaveDays: 0,
      extraHours: 6,
      effectivePercentage: 50, // a low percentage would halve 6h under scaled subtraction - it must not
      planned: 0,
      lookupRows: [],
    })

    expect(result.available).toBe(10 * 8 * 0.5 - 6)
    expect(result.total).toBe(80)
  })

  it('stacks extraHours and leave hours together off Available', () => {
    const result = computeCapacity({
      workingDays: 10,
      leaveDays: 1, // 8h
      extraHours: 4,
      effectivePercentage: 100,
      planned: 0,
      lookupRows: [],
    })

    expect(result.available).toBe(10 * 8 - 8 - 4)
  })
})
