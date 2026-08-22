import { describe, expect, it } from 'vitest'
import { normalizePlanningJiraKey } from './atlasPlanningKey'

// TDD (ticket 01, .scratch/atlas-planning-tab): the Planning tab's own
// "light client-side format check" (spec story 8) - written and watched red
// before atlasPlanningKey.ts existed. Deliberately stricter than constants/
// jira.ts's normalizeJiraKey, which only reshapes a prefix and accepts any
// non-blank input (so "hello" normalizes to "WOSMVP-HELLO" without
// complaint) - this validates the WOSMVP-<digits> shape itself, which is
// what actually catches an obvious typo before it's saved.
describe('normalizePlanningJiraKey', () => {
  it('normalizes a bare number to the full key', () => {
    expect(normalizePlanningJiraKey('14802')).toBe('WOSMVP-14802')
  })

  it('normalizes an already-full key, uppercasing it', () => {
    expect(normalizePlanningJiraKey('wosmvp-14802')).toBe('WOSMVP-14802')
  })

  it('normalizes a full key missing its dash', () => {
    expect(normalizePlanningJiraKey('WOSMVP14802')).toBe('WOSMVP-14802')
  })

  it('trims surrounding whitespace', () => {
    expect(normalizePlanningJiraKey('  14802  ')).toBe('WOSMVP-14802')
  })

  it('rejects blank input', () => {
    expect(normalizePlanningJiraKey('')).toBeNull()
    expect(normalizePlanningJiraKey('   ')).toBeNull()
  })

  it('rejects a non-numeric suffix (the obvious-typo case)', () => {
    expect(normalizePlanningJiraKey('abc')).toBeNull()
    expect(normalizePlanningJiraKey('WOSMVP-abc')).toBeNull()
  })

  it('rejects a suffix mixing digits and letters', () => {
    expect(normalizePlanningJiraKey('WOSMVP-148O2')).toBeNull()
  })
})
