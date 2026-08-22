import { describe, expect, it } from 'vitest'
import { buildAtlasPlanningLeaveDays } from './atlasPlanningGanttLeaveDays'
import type { AtlasPlanningHoliday, AtlasPlanningLeaveMark, AtlasRosterMember } from '../types'

function member(id: string, name: string): AtlasRosterMember {
  return { _id: id, personId: { _id: `p-${id}`, name, email: `${name}@x.com`, jiraAccountId: `acc-${id}` }, createdAt: '2026-08-01T00:00:00.000Z' }
}

const alice = member('m1', 'Alice')
const bob = member('m2', 'Bob')

describe('buildAtlasPlanningLeaveDays', () => {
  it('returns nothing for an empty roster', () => {
    expect(buildAtlasPlanningLeaveDays([], [], [])).toEqual([])
  })

  it("builds a leave-full-leave-keyed day from a person's own full-day leave mark", () => {
    const marks: AtlasPlanningLeaveMark[] = [{ _id: 'l1', rosterMemberId: 'm1', date: '2026-08-11', portion: 'full' }]
    const days = buildAtlasPlanningLeaveDays([alice], marks, [])
    expect(days).toEqual([
      { key: 'leave-full-leave-m1-2026-08-11', rosterMemberId: 'm1', date: '2026-08-11', portion: 'full', label: 'Leave' },
    ])
  })

  it('builds a leave-half-leave-keyed day from a half-day leave mark', () => {
    const marks: AtlasPlanningLeaveMark[] = [{ _id: 'l1', rosterMemberId: 'm1', date: '2026-08-12', portion: 'half' }]
    const days = buildAtlasPlanningLeaveDays([alice], marks, [])
    expect(days[0]).toMatchObject({ key: 'leave-half-leave-m1-2026-08-12', portion: 'half' })
  })

  it("only attaches a leave mark to the person it belongs to, never a different roster member's row", () => {
    const marks: AtlasPlanningLeaveMark[] = [{ _id: 'l1', rosterMemberId: 'm1', date: '2026-08-11', portion: 'full' }]
    const days = buildAtlasPlanningLeaveDays([alice, bob], marks, [])
    expect(days).toHaveLength(1)
    expect(days[0].rosterMemberId).toBe('m1')
  })

  it('applies a shared holiday date to every roster member, always as full-portion', () => {
    const holidays: AtlasPlanningHoliday[] = [{ _id: 'h1', date: '2026-08-13' }]
    const days = buildAtlasPlanningLeaveDays([alice, bob], [], holidays)
    expect(days).toEqual([
      { key: 'leave-full-holiday-m1-2026-08-13', rosterMemberId: 'm1', date: '2026-08-13', portion: 'full', label: 'Holiday' },
      { key: 'leave-full-holiday-m2-2026-08-13', rosterMemberId: 'm2', date: '2026-08-13', portion: 'full', label: 'Holiday' },
    ])
  })

  it('combines per-person leave with shared holidays for the same roster', () => {
    const marks: AtlasPlanningLeaveMark[] = [{ _id: 'l1', rosterMemberId: 'm1', date: '2026-08-11', portion: 'full' }]
    const holidays: AtlasPlanningHoliday[] = [{ _id: 'h1', date: '2026-08-13' }]
    const days = buildAtlasPlanningLeaveDays([alice, bob], marks, holidays)
    expect(days).toHaveLength(3)
    expect(days.filter((d) => d.label === 'Holiday')).toHaveLength(2)
    expect(days.filter((d) => d.label === 'Leave')).toHaveLength(1)
  })
})
