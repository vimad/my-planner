import { describe, expect, it } from 'vitest'
import { computeSprintBreakdown } from './sprintBreakdown'
import type { DevQaRoleResolution, Person, SprintPlanEntry, TeamMembership, Ticket } from '../types'

const ada: Person = { _id: 'p1', name: 'Ada', email: 'ada@example.com', jiraAccountId: 'acc-ada' }
const bob: Person = { _id: 'p2', name: 'Bob', email: 'bob@example.com', jiraAccountId: 'acc-bob' }
const qaCarol: Person = { _id: 'p3', name: 'Carol', email: 'carol@example.com', jiraAccountId: 'acc-carol' }

const devMembership: TeamMembership = { _id: 'm1', teamId: 't1', personId: ada, role: 'SE', capacityPercentOverride: null }
const devMembership2: TeamMembership = { _id: 'm2', teamId: 't1', personId: bob, role: 'SSE', capacityPercentOverride: null }
const qaMembership: TeamMembership = { _id: 'm3', teamId: 't1', personId: qaCarol, role: 'QA', capacityPercentOverride: null }

function ticket(overrides: Partial<Ticket> & { jiraKey: string }): Ticket {
  return {
    _id: overrides.jiraKey,
    type: 'Task',
    title: 'A ticket',
    status: 'To Do',
    assigneeAccountId: null,
    assigneeDisplayName: null,
    assigneeEmail: null,
    estimateHours: null,
    labels: [],
    stream: null,
    epicKey: null,
    parentKey: null,
    subtaskKind: null,
    currentSprintKey: null,
    lastSyncedAt: new Date().toISOString(),
    ...overrides,
  }
}

function nonSplitEntry(id: string, t: Ticket, plannedHours: number, isFeature?: boolean): SprintPlanEntry {
  return {
    _id: id,
    teamId: 't1',
    sprintId: 's1',
    ticketId: t,
    order: 0,
    devOrder: null,
    qaOrder: null,
    estimateHours: plannedHours,
    planHours: null,
    spillHours: null,
    plannedHours,
    ...(isFeature !== undefined ? { isFeature } : {}),
  }
}

function resolved(personId: string): DevQaRoleResolution {
  return { status: 'resolved', source: 'subtask', personId, jiraAssigneeDisplayName: null }
}
function needsAssignment(): DevQaRoleResolution {
  return { status: 'needs-assignment', jiraAssigneeDisplayName: null }
}
function unmapped(): DevQaRoleResolution {
  return { status: 'unmapped', assigneeAccountId: 'acc-x', assigneeDisplayName: 'Mystery', assigneeEmail: null, jiraAssigneeDisplayName: null }
}

function splitEntry(
  id: string,
  t: Ticket,
  devQa: { dev: DevQaRoleResolution; qa: DevQaRoleResolution },
  devPlannedHours: number,
  qaPlannedHours: number,
): SprintPlanEntry {
  return {
    _id: id,
    teamId: 't1',
    sprintId: 's1',
    ticketId: t,
    order: 0,
    devOrder: 0,
    qaOrder: 0,
    devQa,
    devEstimateHours: devPlannedHours,
    devPlanHours: null,
    devSpillHours: null,
    devPlannedHours,
    qaEstimateHours: qaPlannedHours,
    qaPlanHours: null,
    qaSpillHours: null,
    qaPlannedHours,
  }
}

describe('computeSprintBreakdown', () => {
  it('buckets a Story ticket as Features', () => {
    const t = ticket({ jiraKey: 'WOSMVP-1', type: 'Story', assigneeAccountId: 'acc-ada' })
    const entries = [nonSplitEntry('e1', t, 4)]
    const result = computeSprintBreakdown(entries, [devMembership])
    expect(result.totalHours).toBe(4)
    expect(result.slices.find((s) => s.bucket === 'Features')?.hours).toBe(4)
  })

  it('buckets a Bug ticket as Bugs', () => {
    const t = ticket({ jiraKey: 'WOSMVP-2', type: 'Bug', assigneeAccountId: 'acc-ada' })
    const entries = [nonSplitEntry('e1', t, 3)]
    const result = computeSprintBreakdown(entries, [devMembership])
    expect(result.slices.find((s) => s.bucket === 'Bugs')?.hours).toBe(3)
  })

  it('buckets a Task with isFeature=true as Features', () => {
    const t = ticket({ jiraKey: 'WOSMVP-3', type: 'Task', assigneeAccountId: 'acc-ada' })
    const entries = [nonSplitEntry('e1', t, 5, true)]
    const result = computeSprintBreakdown(entries, [devMembership])
    expect(result.slices.find((s) => s.bucket === 'Features')?.hours).toBe(5)
  })

  it('buckets a Task with isFeature=false or undefined as Technical items', () => {
    const tFalse = ticket({ jiraKey: 'WOSMVP-4', type: 'Task', assigneeAccountId: 'acc-ada' })
    const tUndefined = ticket({ jiraKey: 'WOSMVP-5', type: 'Task', assigneeAccountId: 'acc-ada' })
    const entries = [nonSplitEntry('e1', tFalse, 2, false), nonSplitEntry('e2', tUndefined, 3)]
    const result = computeSprintBreakdown(entries, [devMembership])
    expect(result.slices.find((s) => s.bucket === 'Technical items')?.hours).toBe(5)
  })

  it('excludes a placement landing on a QA-role membership', () => {
    const t = ticket({ jiraKey: 'WOSMVP-6', type: 'Task', assigneeAccountId: 'acc-carol' })
    const entries = [nonSplitEntry('e1', t, 8, true)]
    const result = computeSprintBreakdown(entries, [qaMembership])
    expect(result.totalHours).toBe(0)
  })

  it('excludes an Unmapped/needs-assignment placement', () => {
    const unmappedTicket = ticket({ jiraKey: 'WOSMVP-7', type: 'Task', assigneeAccountId: 'acc-off-roster' })
    const entries = [nonSplitEntry('e1', unmappedTicket, 6, true)]
    const result = computeSprintBreakdown(entries, [devMembership])
    expect(result.totalHours).toBe(0)
  })

  it("excludes a Split ticket's qa-role placement even when it lands on a dev-role person's row", () => {
    const t = ticket({ jiraKey: 'WOSMVP-8', type: 'Story' })
    const entries = [splitEntry('e1', t, { dev: resolved('p1'), qa: resolved('p2') }, 4, 6)]
    // Both dev and qa resolve to dev-role memberships (p1=Ada dev, p2=Bob dev) -
    // qa's placement must still be excluded regardless of whose row it's on.
    const result = computeSprintBreakdown(entries, [devMembership, devMembership2])
    expect(result.totalHours).toBe(4)
    expect(result.slices.find((s) => s.bucket === 'Features')?.hours).toBe(4)
  })

  it('excludes a needs-assignment/unmapped Split role placement', () => {
    const t = ticket({ jiraKey: 'WOSMVP-9', type: 'Story' })
    const entries = [splitEntry('e1', t, { dev: needsAssignment(), qa: unmapped() }, 4, 6)]
    const result = computeSprintBreakdown(entries, [devMembership])
    expect(result.totalHours).toBe(0)
  })

  it('rounds percentages to sum to exactly 100 even for an uneven split', () => {
    // 1 / 3 hours each -> naive rounding would give 33/33/33 = 99.
    const story = ticket({ jiraKey: 'WOSMVP-10', type: 'Story', assigneeAccountId: 'acc-ada' })
    const bug = ticket({ jiraKey: 'WOSMVP-11', type: 'Bug', assigneeAccountId: 'acc-ada' })
    const task = ticket({ jiraKey: 'WOSMVP-12', type: 'Task', assigneeAccountId: 'acc-ada' })
    const entries = [nonSplitEntry('e1', story, 1), nonSplitEntry('e2', bug, 1), nonSplitEntry('e3', task, 1, false)]
    const result = computeSprintBreakdown(entries, [devMembership])
    const sum = result.slices.reduce((acc, s) => acc + s.percent, 0)
    expect(sum).toBe(100)
  })

  it('returns totalHours 0 and all slices 0% for empty input', () => {
    const result = computeSprintBreakdown([], [devMembership])
    expect(result.totalHours).toBe(0)
    for (const slice of result.slices) {
      expect(slice.hours).toBe(0)
      expect(slice.percent).toBe(0)
    }
  })
})
