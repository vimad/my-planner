import { describe, expect, it } from 'vitest'
import { plannedHours, resolvedPlan } from '../src/services/planSpill.ts'

describe('resolvedPlan', () => {
  it('follows Original when Plan is null (no override)', () => {
    expect(resolvedPlan(16, { planHours: null, spillHours: null })).toBe(16)
  })

  it('raises above Original when Plan is set higher (buffer)', () => {
    expect(resolvedPlan(16, { planHours: 24, spillHours: null })).toBe(24)
  })

  it('lowers below Original when Plan is set lower', () => {
    expect(resolvedPlan(16, { planHours: 8, spillHours: null })).toBe(8)
  })
})

describe('plannedHours', () => {
  it('returns Original unchanged when both Plan and Spill are null', () => {
    expect(plannedHours(16, { planHours: null, spillHours: null })).toBe(16)
  })

  it('is a pure raise/lower of Original when only Plan is set (Spill null defaults to 0)', () => {
    expect(plannedHours(16, { planHours: 24, spillHours: null })).toBe(24)
    expect(plannedHours(16, { planHours: 8, spillHours: null })).toBe(8)
  })

  it('subtracts from Original when only Spill is set (Plan null follows Original)', () => {
    expect(plannedHours(16, { planHours: null, spillHours: 6 })).toBe(10)
  })

  it('subtracts Spill from an explicitly-set Plan when both are set together', () => {
    expect(plannedHours(24, { planHours: 20, spillHours: 5 })).toBe(15)
  })

  it('the worked example: Original 16, Plan 16, Spill 16 -> Planned 0', () => {
    expect(plannedHours(16, { planHours: 16, spillHours: 16 })).toBe(0)
  })

  it('floors at 0 rather than going negative when Spill somehow exceeds Plan (defensive - the route blocks this at write time)', () => {
    expect(plannedHours(16, { planHours: 10, spillHours: 15 })).toBe(0)
  })
})
