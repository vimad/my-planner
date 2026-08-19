import { describe, expect, it } from 'vitest'
import { buildBlockedByLookup, epicStats, flattenTasks, formatDateRange } from './atlasStats'
import type { AtlasEpic, AtlasTaskNode } from '../types'

function task(overrides: Partial<AtlasTaskNode> = {}): AtlasTaskNode {
  return {
    _id: 't1',
    epicId: 'e1',
    parentTaskId: null,
    jiraKey: 'WOSMVP-100',
    title: 'A task',
    jiraUrl: 'https://example.com/browse/WOSMVP-100',
    assigneeAccountId: null,
    status: 'To Do',
    startDate: null,
    endDate: null,
    atRisk: false,
    notes: '',
    blockedBy: [],
    archived: false,
    subtasks: [],
    ...overrides,
  }
}

function epic(overrides: Partial<AtlasEpic> = {}): AtlasEpic {
  return {
    _id: 'e1',
    jiraKey: 'WOSMVP-1',
    title: 'An epic',
    jiraUrl: 'https://example.com/browse/WOSMVP-1',
    notes: '',
    archived: false,
    lastSyncedAt: '2026-08-19T00:00:00.000Z',
    tasks: [],
    ...overrides,
  }
}

describe('flattenTasks', () => {
  it('flattens sub-tasks alongside their parents, depth-first', () => {
    const tasks = [
      task({ _id: 't1', jiraKey: 'A', subtasks: [task({ _id: 't1a', jiraKey: 'A1' })] }),
      task({ _id: 't2', jiraKey: 'B' }),
    ]
    expect(flattenTasks(tasks).map((t) => t.jiraKey)).toEqual(['A', 'A1', 'B'])
  })

  it('returns an empty array for an empty tree', () => {
    expect(flattenTasks([])).toEqual([])
  })
})

describe('epicStats', () => {
  it('counts status buckets and at-risk across tasks and sub-tasks', () => {
    const stats = epicStats(
      epic({
        tasks: [
          task({ _id: 't1', status: 'To Do' }),
          task({
            _id: 't2',
            status: 'In Progress',
            atRisk: true,
            subtasks: [task({ _id: 't2a', status: 'Done' }), task({ _id: 't2b', status: 'Done', atRisk: true })],
          }),
        ],
      }),
    )
    expect(stats.total).toBe(4)
    expect(stats.todo).toBe(1)
    expect(stats.inProgress).toBe(1)
    expect(stats.done).toBe(2)
    expect(stats.atRisk).toBe(2)
  })

  it('computes progress% as done/total, rounded', () => {
    const stats = epicStats(
      epic({
        tasks: [task({ _id: 't1', status: 'Done' }), task({ _id: 't2', status: 'Done' }), task({ _id: 't3', status: 'To Do' })],
      }),
    )
    expect(stats.progressPct).toBe(67)
  })

  it('reports 0% progress and empty counts for an epic with no tasks yet', () => {
    const stats = epicStats(epic({ tasks: [] }))
    expect(stats).toMatchObject({ total: 0, todo: 0, inProgress: 0, done: 0, atRisk: 0, progressPct: 0, startDate: null, endDate: null })
  })

  it('rolls up min-start/max-end across all tasks and sub-tasks, ignoring unset dates', () => {
    const stats = epicStats(
      epic({
        tasks: [
          task({ _id: 't1', startDate: '2026-07-10', endDate: '2026-07-20' }),
          task({
            _id: 't2',
            startDate: null,
            endDate: null,
            subtasks: [task({ _id: 't2a', startDate: '2026-06-01', endDate: '2026-08-15' })],
          }),
        ],
      }),
    )
    expect(stats.startDate).toBe('2026-06-01')
    expect(stats.endDate).toBe('2026-08-15')
  })
})

describe('formatDateRange', () => {
  it('renders "No dates set" when both are missing', () => {
    expect(formatDateRange(null, null)).toBe('No dates set')
  })

  it('renders a "Mon D – Mon D" range when both are set', () => {
    expect(formatDateRange('2026-07-01', '2026-07-20')).toBe('Jul 1 – Jul 20')
  })

  it('renders a "From ..." fragment when only start is set', () => {
    expect(formatDateRange('2026-07-01', null)).toBe('From Jul 1')
  })

  it('renders an "Until ..." fragment when only end is set', () => {
    expect(formatDateRange(null, '2026-07-20')).toBe('Until Jul 20')
  })
})

describe('buildBlockedByLookup', () => {
  it('resolves a task id to its jiraKey and owning epic key, across every tracked epic', () => {
    const epics: AtlasEpic[] = [
      epic({
        _id: 'e1',
        jiraKey: 'WOSMVP-1',
        tasks: [task({ _id: 't1', jiraKey: 'WOSMVP-100', subtasks: [task({ _id: 't1a', jiraKey: 'WOSMVP-101' })] })],
      }),
      epic({ _id: 'e2', jiraKey: 'WOSMVP-2', tasks: [task({ _id: 't2', jiraKey: 'WOSMVP-200' })] }),
    ]
    const lookup = buildBlockedByLookup(epics)
    expect(lookup.get('t1')).toEqual({ taskId: 't1', jiraKey: 'WOSMVP-100', epicId: 'e1', epicKey: 'WOSMVP-1' })
    expect(lookup.get('t1a')).toEqual({ taskId: 't1a', jiraKey: 'WOSMVP-101', epicId: 'e1', epicKey: 'WOSMVP-1' })
    expect(lookup.get('t2')).toEqual({ taskId: 't2', jiraKey: 'WOSMVP-200', epicId: 'e2', epicKey: 'WOSMVP-2' })
  })

  it('leaves an unresolvable id out of the map', () => {
    const lookup = buildBlockedByLookup([epic({ tasks: [task({ _id: 't1' })] })])
    expect(lookup.get('does-not-exist')).toBeUndefined()
  })
})
