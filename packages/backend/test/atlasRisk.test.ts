import { describe, expect, it } from 'vitest'
import { computeAutoRisk, resolveAtRisk } from '../src/utils/atlasRisk.ts'

describe('computeAutoRisk', () => {
  it('is false when there is no endDate', () => {
    expect(computeAutoRisk(null, 'In Progress', '2026-08-19')).toBe(false)
  })

  it('is false when status is Done, even with a passed endDate', () => {
    expect(computeAutoRisk('2026-08-01', 'Done', '2026-08-19')).toBe(false)
  })

  it('is true once today is strictly after endDate and status is not Done', () => {
    expect(computeAutoRisk('2026-08-01', 'To Do', '2026-08-19')).toBe(true)
    expect(computeAutoRisk('2026-08-01', 'In Progress', '2026-08-19')).toBe(true)
  })

  it('is false when endDate is today (not yet passed)', () => {
    expect(computeAutoRisk('2026-08-19', 'In Progress', '2026-08-19')).toBe(false)
  })

  it('is false when endDate is in the future', () => {
    expect(computeAutoRisk('2026-09-01', 'In Progress', '2026-08-19')).toBe(false)
  })
})

describe('resolveAtRisk', () => {
  it('uses the auto-computed value when atRiskOverride is false, ignoring whatever atRisk currently holds', () => {
    const task = { endDate: '2026-08-01', status: 'In Progress' as const, atRisk: false, atRiskOverride: false }
    expect(resolveAtRisk(task, '2026-08-19')).toBe(true)
  })

  it('is false via the auto rule when no override and endDate has not passed', () => {
    const task = { endDate: '2026-09-01', status: 'In Progress' as const, atRisk: true, atRiskOverride: false }
    expect(resolveAtRisk(task, '2026-08-19')).toBe(false)
  })

  it('a manual override of true survives even when the auto rule would say false', () => {
    const task = { endDate: '2026-09-01', status: 'In Progress' as const, atRisk: true, atRiskOverride: true }
    expect(resolveAtRisk(task, '2026-08-19')).toBe(true)
  })

  it('a manual override of false survives even when the auto rule would say true (endDate passed)', () => {
    const task = { endDate: '2026-08-01', status: 'In Progress' as const, atRisk: false, atRiskOverride: true }
    expect(resolveAtRisk(task, '2026-08-19')).toBe(false)
  })

  it('defaults `today` to the real current date when omitted', () => {
    const farFuture = { endDate: '2999-01-01', status: 'In Progress' as const, atRisk: false, atRiskOverride: false }
    expect(resolveAtRisk(farFuture)).toBe(false)
  })
})
