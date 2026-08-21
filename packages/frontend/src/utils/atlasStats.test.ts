import { describe, expect, it } from 'vitest'
import {
  attentionItems,
  buildBlockedByCandidates,
  buildBlockedByLookup,
  collectLeafTasks,
  epicHealth,
  epicStats,
  flattenTasks,
  formatDateRange,
  groupByParentTask,
} from './atlasStats'
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
    atRiskOverride: false,
    notes: null,
    notesText: '',
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
    notes: null,
    notesText: '',
    archived: false,
    lastSyncedAt: '2026-08-19T00:00:00.000Z',
    tasks: [],
    isOutsideProgram: false,
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

describe('collectLeafTasks', () => {
  it('excludes a task that has visible sub-tasks, walking into its children instead', () => {
    const leaves = collectLeafTasks([
      epic({
        jiraKey: 'WOSMVP-1',
        title: 'An epic',
        tasks: [
          task({
            _id: 't1',
            jiraKey: 'A',
            subtasks: [task({ _id: 't1a', jiraKey: 'A1' }), task({ _id: 't1b', jiraKey: 'A2' })],
          }),
          task({ _id: 't2', jiraKey: 'B' }),
        ],
      }),
    ])
    expect(leaves.map((l) => l.jiraKey)).toEqual(['A1', 'A2', 'B'])
  })

  it("tags a sub-task leaf with its immediate parent's id/key/title/jiraUrl", () => {
    const leaves = collectLeafTasks([
      epic({
        jiraKey: 'WOSMVP-1',
        title: 'An epic',
        tasks: [
          task({
            _id: 't1',
            jiraKey: 'A',
            title: 'Parent task',
            jiraUrl: 'https://example.com/browse/A',
            subtasks: [task({ _id: 't1a', jiraKey: 'A1' }), task({ _id: 't1b', jiraKey: 'A2' })],
          }),
        ],
      }),
    ])
    expect(leaves.map((l) => ({ jiraKey: l.jiraKey, parent: l.parent }))).toEqual([
      { jiraKey: 'A1', parent: { taskId: 't1', jiraKey: 'A', title: 'Parent task', jiraUrl: 'https://example.com/browse/A' } },
      { jiraKey: 'A2', parent: { taskId: 't1', jiraKey: 'A', title: 'Parent task', jiraUrl: 'https://example.com/browse/A' } },
    ])
  })

  it('leaves parent null for a top-level leaf task with no parent', () => {
    const leaves = collectLeafTasks([epic({ tasks: [task({ _id: 't1', jiraKey: 'B' })] })])
    expect(leaves).toEqual([expect.objectContaining({ parent: null })])
  })

  it('never includes the epic itself, only its tasks/sub-tasks', () => {
    const leaves = collectLeafTasks([epic({ jiraKey: 'WOSMVP-1', title: 'An epic', tasks: [task({ jiraKey: 'A' })] })])
    expect(leaves.every((l) => l.jiraKey !== 'WOSMVP-1')).toBe(true)
  })

  it('excludes an archived task, and treats an archived sub-task as invisible when deciding leaf-ness', () => {
    const leaves = collectLeafTasks([
      epic({
        jiraKey: 'WOSMVP-1',
        title: 'An epic',
        tasks: [
          task({ _id: 't1', jiraKey: 'A', archived: true }),
          // Only visible (non-archived) child is archived - so B itself
          // becomes a leaf, not skipped for "having children".
          task({ _id: 't2', jiraKey: 'B', subtasks: [task({ _id: 't2a', jiraKey: 'B1', archived: true })] }),
        ],
      }),
    ])
    expect(leaves.map((l) => l.jiraKey)).toEqual(['B'])
  })

  it('carries the owning epic key/title and the task fields needed for display', () => {
    const leaves = collectLeafTasks([
      epic({
        jiraKey: 'WOSMVP-1',
        title: 'An epic',
        tasks: [task({ _id: 't1', jiraKey: 'A', title: 'Do the thing', status: 'In Progress', assigneeAccountId: 'acc-1' })],
      }),
    ])
    expect(leaves).toEqual([
      {
        taskId: 't1',
        jiraKey: 'A',
        title: 'Do the thing',
        jiraUrl: 'https://example.com/browse/WOSMVP-100',
        status: 'In Progress',
        assigneeAccountId: 'acc-1',
        epicKey: 'WOSMVP-1',
        epicTitle: 'An epic',
        isOutsideProgram: false,
        parent: null,
      },
    ])
  })

  it("tags a leaf with the owning epic's isOutsideProgram flag", () => {
    const leaves = collectLeafTasks([
      epic({ jiraKey: 'WOSMVP-1', isOutsideProgram: true, tasks: [task({ _id: 't1', jiraKey: 'A' })] }),
    ])
    expect(leaves).toEqual([expect.objectContaining({ jiraKey: 'A', isOutsideProgram: true })])
  })

  it('returns an empty array across epics with no tasks', () => {
    expect(collectLeafTasks([epic({ tasks: [] })])).toEqual([])
  })
})

describe('groupByParentTask', () => {
  function leaf(overrides: { jiraKey: string; parent?: { taskId: string; jiraKey: string; title: string; jiraUrl: string } | null }) {
    return {
      task: {
        taskId: overrides.jiraKey,
        jiraKey: overrides.jiraKey,
        title: overrides.jiraKey,
        jiraUrl: `https://example.com/browse/${overrides.jiraKey}`,
        status: 'To Do' as const,
        assigneeAccountId: null,
        epicKey: 'WOSMVP-1',
        epicTitle: 'An epic',
        isOutsideProgram: false,
        parent: overrides.parent ?? null,
      },
    }
  }

  const parentA = { taskId: 't1', jiraKey: 'A', title: 'Parent task', jiraUrl: 'https://example.com/browse/A' }
  const parentB = { taskId: 't2', jiraKey: 'B', title: 'Parent B', jiraUrl: 'https://example.com/browse/B' }

  it('clusters rows sharing the same parent task into a single group, in first-appearance order', () => {
    const a1 = leaf({ jiraKey: 'A1', parent: parentA })
    const a2 = leaf({ jiraKey: 'A2', parent: parentA })
    const groups = groupByParentTask([a1, a2])
    expect(groups).toEqual([{ kind: 'group', parent: parentA, rows: [a1, a2] }])
  })

  it('leaves a row with no parent as its own single entry', () => {
    const b = leaf({ jiraKey: 'B' })
    expect(groupByParentTask([b])).toEqual([{ kind: 'single', row: b }])
  })

  it('sorts all groups ahead of all singles, even when a single appears first in the input', () => {
    const s1 = leaf({ jiraKey: 'S1' })
    const a1 = leaf({ jiraKey: 'A1', parent: parentA })
    const s2 = leaf({ jiraKey: 'S2' })
    const a2 = leaf({ jiraKey: 'A2', parent: parentA })
    const groups = groupByParentTask([s1, a1, s2, a2])
    expect(groups).toEqual([
      { kind: 'group', parent: parentA, rows: [a1, a2] },
      { kind: 'single', row: s1 },
      { kind: 'single', row: s2 },
    ])
  })

  it('keeps rows under different parents in separate groups, ordered by first appearance', () => {
    const a1 = leaf({ jiraKey: 'A1', parent: parentA })
    const b1 = leaf({ jiraKey: 'B1', parent: parentB })
    const groups = groupByParentTask([b1, a1])
    expect(groups.map((g) => (g.kind === 'group' ? g.parent.jiraKey : null))).toEqual(['B', 'A'])
  })

  it('returns an empty array for no rows', () => {
    expect(groupByParentTask([])).toEqual([])
  })
})

describe('epicHealth', () => {
  it('is on-track when the epic has no at-risk tasks', () => {
    expect(epicHealth({ atRisk: 0 })).toBe('on-track')
  })

  it('is watch when the epic has exactly one at-risk task', () => {
    expect(epicHealth({ atRisk: 1 })).toBe('watch')
  })

  it('is at-risk when the epic has two or more at-risk tasks', () => {
    expect(epicHealth({ atRisk: 2 })).toBe('at-risk')
    expect(epicHealth({ atRisk: 5 })).toBe('at-risk')
  })
})

describe('attentionItems', () => {
  it('includes an at-risk task with reason "at-risk"', () => {
    const items = attentionItems(epic({ tasks: [task({ _id: 't1', jiraKey: 'WOSMVP-100', atRisk: true })] }))
    expect(items).toEqual([{ task: expect.objectContaining({ jiraKey: 'WOSMVP-100' }), reason: 'at-risk' }])
  })

  it('includes a non-Done task blocked on something with reason "blocked"', () => {
    const items = attentionItems(
      epic({ tasks: [task({ _id: 't1', jiraKey: 'WOSMVP-100', status: 'In Progress', blockedBy: ['t0'] })] }),
    )
    expect(items).toEqual([{ task: expect.objectContaining({ jiraKey: 'WOSMVP-100' }), reason: 'blocked' }])
  })

  it('excludes a blocked task once it reaches Done', () => {
    const items = attentionItems(epic({ tasks: [task({ status: 'Done', blockedBy: ['t0'] })] }))
    expect(items).toEqual([])
  })

  it('excludes a clean task (not at-risk, not blocked)', () => {
    const items = attentionItems(epic({ tasks: [task()] }))
    expect(items).toEqual([])
  })

  it('excludes an archived task even if it is at-risk', () => {
    const items = attentionItems(epic({ tasks: [task({ atRisk: true, archived: true })] }))
    expect(items).toEqual([])
  })

  it('prefers reason "at-risk" over "blocked" when a task is both', () => {
    const items = attentionItems(epic({ tasks: [task({ atRisk: true, status: 'In Progress', blockedBy: ['t0'] })] }))
    expect(items).toEqual([{ task: expect.anything(), reason: 'at-risk' }])
  })

  it('walks into sub-tasks the same as flattenTasks', () => {
    const items = attentionItems(
      epic({ tasks: [task({ _id: 't1', jiraKey: 'WOSMVP-100', subtasks: [task({ _id: 't1a', jiraKey: 'WOSMVP-101', atRisk: true })] })] }),
    )
    expect(items).toEqual([{ task: expect.objectContaining({ jiraKey: 'WOSMVP-101' }), reason: 'at-risk' }])
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
    expect(lookup.get('t1')).toEqual({ taskId: 't1', jiraKey: 'WOSMVP-100', epicId: 'e1', epicKey: 'WOSMVP-1', isOutsideProgram: false })
    expect(lookup.get('t1a')).toEqual({ taskId: 't1a', jiraKey: 'WOSMVP-101', epicId: 'e1', epicKey: 'WOSMVP-1', isOutsideProgram: false })
    expect(lookup.get('t2')).toEqual({ taskId: 't2', jiraKey: 'WOSMVP-200', epicId: 'e2', epicKey: 'WOSMVP-2', isOutsideProgram: false })
  })

  it("tags a resolved blocker with the owning epic's isOutsideProgram flag", () => {
    const epics: AtlasEpic[] = [
      epic({ _id: 'e1', jiraKey: 'WOSMVP-1', isOutsideProgram: true, tasks: [task({ _id: 't1', jiraKey: 'WOSMVP-100' })] }),
    ]
    expect(buildBlockedByLookup(epics).get('t1')).toMatchObject({ isOutsideProgram: true })
  })

  it('leaves an unresolvable id out of the map', () => {
    const lookup = buildBlockedByLookup([epic({ tasks: [task({ _id: 't1' })] })])
    expect(lookup.get('does-not-exist')).toBeUndefined()
  })
})

describe('buildBlockedByCandidates', () => {
  it('includes tasks and sub-tasks across every non-archived epic, with title + owning epic key', () => {
    const epics: AtlasEpic[] = [
      epic({
        _id: 'e1',
        jiraKey: 'WOSMVP-1',
        tasks: [
          task({ _id: 't1', jiraKey: 'WOSMVP-100', title: 'Do the thing', subtasks: [task({ _id: 't1a', jiraKey: 'WOSMVP-101', title: 'Sub-thing' })] }),
        ],
      }),
      epic({ _id: 'e2', jiraKey: 'WOSMVP-2', tasks: [task({ _id: 't2', jiraKey: 'WOSMVP-200', title: 'Other epic task' })] }),
    ]
    const candidates = buildBlockedByCandidates(epics)
    expect(candidates).toEqual(
      expect.arrayContaining([
        { taskId: 't1', jiraKey: 'WOSMVP-100', title: 'Do the thing', epicId: 'e1', epicKey: 'WOSMVP-1', isOutsideProgram: false },
        { taskId: 't1a', jiraKey: 'WOSMVP-101', title: 'Sub-thing', epicId: 'e1', epicKey: 'WOSMVP-1', isOutsideProgram: false },
        { taskId: 't2', jiraKey: 'WOSMVP-200', title: 'Other epic task', epicId: 'e2', epicKey: 'WOSMVP-2', isOutsideProgram: false },
      ]),
    )
    expect(candidates).toHaveLength(3)
  })

  it('excludes tasks belonging to an archived epic', () => {
    const epics: AtlasEpic[] = [
      epic({ _id: 'e1', jiraKey: 'WOSMVP-1', archived: true, tasks: [task({ _id: 't1', jiraKey: 'WOSMVP-100' })] }),
    ]
    expect(buildBlockedByCandidates(epics)).toEqual([])
  })

  it('excludes an archived task even within a non-archived epic', () => {
    const epics: AtlasEpic[] = [
      epic({
        _id: 'e1',
        jiraKey: 'WOSMVP-1',
        tasks: [task({ _id: 't1', jiraKey: 'WOSMVP-100', archived: true }), task({ _id: 't2', jiraKey: 'WOSMVP-200' })],
      }),
    ]
    expect(buildBlockedByCandidates(epics).map((c) => c.taskId)).toEqual(['t2'])
  })
})
