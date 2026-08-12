import { describe, expect, it } from 'vitest'
import { buildLeaveDays } from './ganttLeaveDays'
import type { Person, SprintCapacity, TeamMembership } from '../types'

const ada: Person = { _id: 'p1', name: 'Ada', email: 'ada@example.com', jiraAccountId: 'acc-ada' }
const bob: Person = { _id: 'p2', name: 'Bob', email: 'bob@example.com', jiraAccountId: 'acc-bob' }
const adaMembership: TeamMembership = { _id: 'm1', teamId: 't1', personId: ada, role: 'SE', capacityPercentOverride: null }
const bobMembership: TeamMembership = { _id: 'm2', teamId: 't1', personId: bob, role: 'SE', capacityPercentOverride: null }

function capacityFor(membership: TeamMembership, leaveEntries: SprintCapacity['leaveEntries'] = []): SprintCapacity {
  return {
    teamMembershipId: membership._id!,
    personId: (membership.personId as Person)._id!,
    personName: (membership.personId as Person).name,
    role: membership.role,
    capacityPercentOverride: null,
    effectivePercentage: 100,
    leaveDays: leaveEntries.length,
    extraHours: 0,
    capacityEntryId: null,
    leaveEntries,
    total: 0,
    available: 0,
    planned: 0,
    remaining: 0,
  }
}

describe('buildLeaveDays', () => {
  it('renders a full-leave day as a red-portion day keyed to its membership row', () => {
    const capacity = [capacityFor(adaMembership, [{ date: '2026-08-11', portion: 'full' }])]
    const days = buildLeaveDays([adaMembership], capacity, [])
    expect(days).toEqual([
      { key: 'leave-full-leave-m1-2026-08-11', membershipId: 'm1', date: '2026-08-11', portion: 'full', label: 'Leave' },
    ])
  })

  it('renders a half-leave day with the half portion, distinguishable by key prefix', () => {
    const capacity = [capacityFor(adaMembership, [{ date: '2026-08-12', portion: 'half' }])]
    const days = buildLeaveDays([adaMembership], capacity, [])
    expect(days).toEqual([
      { key: 'leave-half-leave-m1-2026-08-12', membershipId: 'm1', date: '2026-08-12', portion: 'half', label: 'Leave' },
    ])
  })

  it('renders a sprint holiday as a full-portion day on every membership row, even with no capacity record', () => {
    const days = buildLeaveDays([adaMembership, bobMembership], [], ['2026-08-13'])
    expect(days).toEqual([
      { key: 'leave-full-holiday-m1-2026-08-13', membershipId: 'm1', date: '2026-08-13', portion: 'full', label: 'Holiday' },
      { key: 'leave-full-holiday-m2-2026-08-13', membershipId: 'm2', date: '2026-08-13', portion: 'full', label: 'Holiday' },
    ])
  })

  it('combines a person leave entries with sprint-wide holidays across multiple people', () => {
    const capacity = [
      capacityFor(adaMembership, [{ date: '2026-08-11', portion: 'full' }]),
      capacityFor(bobMembership, [{ date: '2026-08-12', portion: 'half' }]),
    ]
    const days = buildLeaveDays([adaMembership, bobMembership], capacity, ['2026-08-14'])
    expect(days).toEqual([
      { key: 'leave-full-leave-m1-2026-08-11', membershipId: 'm1', date: '2026-08-11', portion: 'full', label: 'Leave' },
      { key: 'leave-full-holiday-m1-2026-08-14', membershipId: 'm1', date: '2026-08-14', portion: 'full', label: 'Holiday' },
      { key: 'leave-half-leave-m2-2026-08-12', membershipId: 'm2', date: '2026-08-12', portion: 'half', label: 'Leave' },
      { key: 'leave-full-holiday-m2-2026-08-14', membershipId: 'm2', date: '2026-08-14', portion: 'full', label: 'Holiday' },
    ])
  })

  it('returns nothing for a membership with no leave and no sprint holidays', () => {
    expect(buildLeaveDays([adaMembership], [capacityFor(adaMembership)], [])).toEqual([])
  })
})
