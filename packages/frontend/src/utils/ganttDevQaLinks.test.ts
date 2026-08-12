import { describe, expect, it } from 'vitest'
import { computeDevQaLinks } from './ganttDevQaLinks'
import type { GanttPlacedBar } from './ganttPlacement'
import type { DevQaRoleResolution, SprintPlanEntry, Ticket } from '../types'

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

function resolved(personId: string): DevQaRoleResolution {
  return { status: 'resolved', source: 'subtask', personId, jiraAssigneeDisplayName: null }
}
function needsAssignment(): DevQaRoleResolution {
  return { status: 'needs-assignment', jiraAssigneeDisplayName: null }
}

function splitEntry(id: string, t: Ticket, devQa: { dev: DevQaRoleResolution; qa: DevQaRoleResolution }): SprintPlanEntry {
  return {
    _id: id,
    teamId: 't1',
    sprintId: 's1',
    ticketId: t,
    order: 0,
    devOrder: 0,
    qaOrder: 0,
    devQa,
    devEstimateHours: 8,
    devPlanHours: null,
    devSpillHours: null,
    devPlannedHours: 8,
    qaEstimateHours: 4,
    qaPlanHours: null,
    qaSpillHours: null,
    qaPlannedHours: 4,
  }
}

function nonSplitEntry(id: string, t: Ticket): SprintPlanEntry {
  return {
    _id: id,
    teamId: 't1',
    sprintId: 's1',
    ticketId: t,
    order: 0,
    devOrder: null,
    qaOrder: null,
    estimateHours: 8,
    planHours: null,
    spillHours: null,
    plannedHours: 8,
  }
}

function bar(key: string, entry: SprintPlanEntry, role: 'dev' | 'qa' | undefined, membershipId: string, start = '2026-08-10', end = '2026-08-11'): GanttPlacedBar {
  return { key, start, end, entry, role, membershipId }
}

describe('computeDevQaLinks', () => {
  it('links a Split ticket whose Dev and QA placements both render, even across two different rows', () => {
    const t = ticket({ jiraKey: 'PROJ-201', type: 'Story' })
    const entry = splitEntry('e1', t, { dev: resolved('p1'), qa: resolved('p2') })
    const devBar = bar('e1-dev', entry, 'dev', 'm1')
    const qaBar = bar('e1-qa', entry, 'qa', 'm2')
    const rows = new Map([
      ['m1', [devBar]],
      ['m2', [qaBar]],
    ])

    const { taskIdByBarKey, links } = computeDevQaLinks(rows)

    expect(taskIdByBarKey.get('e1-dev')).toBe('dev-PROJ-201')
    expect(taskIdByBarKey.get('e1-qa')).toBe('qa-PROJ-201')
    expect(links).toEqual([{ id: 'link-PROJ-201', type: 's2s', source: 'dev-PROJ-201', target: 'qa-PROJ-201' }])
  })

  it('leaves a lone resolved role (its sibling excluded per ticket 03) unlinked and with its default id', () => {
    const t = ticket({ jiraKey: 'PROJ-9', type: 'Story' })
    const entry = splitEntry('e9', t, { dev: resolved('p1'), qa: needsAssignment() })
    const devBar = bar('e9-dev', entry, 'dev', 'm1')
    const rows = new Map([['m1', [devBar]]])

    const { taskIdByBarKey, links } = computeDevQaLinks(rows)

    expect(taskIdByBarKey.size).toBe(0)
    expect(links).toEqual([])
  })

  it('never links a non-split entry (no devQa) even if it happens to have a role-shaped key', () => {
    const t = ticket({ jiraKey: 'PROJ-10' })
    const entry = nonSplitEntry('e10', t)
    const mainBar = bar('e10-main', entry, undefined, 'm1')
    const rows = new Map([['m1', [mainBar]]])

    const { taskIdByBarKey, links } = computeDevQaLinks(rows)

    expect(taskIdByBarKey.size).toBe(0)
    expect(links).toEqual([])
  })

  it('links multiple independent Split tickets without cross-wiring their ids', () => {
    const t1 = ticket({ jiraKey: 'PROJ-1', type: 'Story' })
    const t2 = ticket({ jiraKey: 'PROJ-2', type: 'Bug' })
    const e1 = splitEntry('e1', t1, { dev: resolved('p1'), qa: resolved('p2') })
    const e2 = splitEntry('e2', t2, { dev: resolved('p2'), qa: resolved('p1') })
    const rows = new Map([
      ['m1', [bar('e1-dev', e1, 'dev', 'm1'), bar('e2-qa', e2, 'qa', 'm1')]],
      ['m2', [bar('e1-qa', e1, 'qa', 'm2'), bar('e2-dev', e2, 'dev', 'm2')]],
    ])

    const { taskIdByBarKey, links } = computeDevQaLinks(rows)

    expect(taskIdByBarKey.get('e1-dev')).toBe('dev-PROJ-1')
    expect(taskIdByBarKey.get('e1-qa')).toBe('qa-PROJ-1')
    expect(taskIdByBarKey.get('e2-dev')).toBe('dev-PROJ-2')
    expect(taskIdByBarKey.get('e2-qa')).toBe('qa-PROJ-2')
    expect(links).toHaveLength(2)
    expect(links).toContainEqual({ id: 'link-PROJ-1', type: 's2s', source: 'dev-PROJ-1', target: 'qa-PROJ-1' })
    expect(links).toContainEqual({ id: 'link-PROJ-2', type: 's2s', source: 'dev-PROJ-2', target: 'qa-PROJ-2' })
  })
})
