import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import type { JiraIssue } from '../src/services/jiraClient.ts'

vi.mock('../src/services/jiraClient.ts', () => ({
  bulkFetchIssues: vi.fn(),
  searchJql: vi.fn(),
  issueUrl: vi.fn((key: string) => `https://wealthos.atlassian.net/browse/${key}`),
}))

interface MockedAtlasEpicModel {
  findOneAndUpdate: Mock
}
interface MockedAtlasTaskModel {
  findOneAndUpdate: Mock
}

vi.mock('../src/models/AtlasEpic.ts', () => ({
  AtlasEpic: { findOneAndUpdate: vi.fn() },
}))
vi.mock('../src/models/AtlasTask.ts', () => ({
  AtlasTask: { findOneAndUpdate: vi.fn() },
}))

const { bulkFetchIssues, searchJql } = (await import('../src/services/jiraClient.ts')) as unknown as {
  bulkFetchIssues: Mock
  searchJql: Mock
}
const { AtlasEpic } = (await import('../src/models/AtlasEpic.ts')) as unknown as { AtlasEpic: MockedAtlasEpicModel }
const { AtlasTask } = (await import('../src/models/AtlasTask.ts')) as unknown as { AtlasTask: MockedAtlasTaskModel }
const {
  mapStatusCategory,
  buildTaskTree,
  trackAndSyncEpic,
  EpicNotFoundError,
  NotAnEpicError,
} = await import('../src/services/atlasSync.ts')

function issue(key: string, fields: Record<string, unknown> = {}): JiraIssue {
  return {
    id: key,
    key,
    fields: {
      summary: 'Some issue title',
      issuetype: { name: 'Task', subtask: false },
      status: { statusCategory: { key: 'new' } },
      assignee: null,
      subtasks: [],
      ...fields,
    },
  }
}

describe('mapStatusCategory', () => {
  it('maps statusCategory.key "new" to "To Do"', () => {
    expect(mapStatusCategory({ status: { statusCategory: { key: 'new' } } })).toBe('To Do')
  })

  it('maps statusCategory.key "indeterminate" to "In Progress"', () => {
    expect(mapStatusCategory({ status: { statusCategory: { key: 'indeterminate' } } })).toBe('In Progress')
  })

  it('maps statusCategory.key "done" to "Done"', () => {
    expect(mapStatusCategory({ status: { statusCategory: { key: 'done' } } })).toBe('Done')
  })

  it('falls back to "To Do" for a missing/unknown statusCategory', () => {
    expect(mapStatusCategory({})).toBe('To Do')
    expect(mapStatusCategory({ status: { statusCategory: { key: 'something-new' } } })).toBe('To Do')
  })
})

describe('buildTaskTree', () => {
  it('returns an empty array for no tasks', () => {
    expect(buildTaskTree([])).toEqual([])
  })

  it('nests a sub-task one level under its parent task', () => {
    const tasks = [
      { _id: 'a', parentTaskId: null, jiraKey: 'WOSMVP-1' },
      { _id: 'b', parentTaskId: 'a', jiraKey: 'WOSMVP-2' },
    ]
    const tree = buildTaskTree(tasks)
    expect(tree).toHaveLength(1)
    expect(tree[0].jiraKey).toBe('WOSMVP-1')
    expect(tree[0].subtasks).toHaveLength(1)
    expect(tree[0].subtasks[0].jiraKey).toBe('WOSMVP-2')
  })

  it('keeps multiple top-level tasks as separate roots, each with their own sub-tasks', () => {
    const tasks = [
      { _id: 'a', parentTaskId: null, jiraKey: 'WOSMVP-1' },
      { _id: 'b', parentTaskId: null, jiraKey: 'WOSMVP-2' },
      { _id: 'c', parentTaskId: 'b', jiraKey: 'WOSMVP-3' },
    ]
    const tree = buildTaskTree(tasks)
    expect(tree.map((t) => t.jiraKey)).toEqual(['WOSMVP-1', 'WOSMVP-2'])
    expect(tree[0].subtasks).toEqual([])
    expect(tree[1].subtasks.map((t) => t.jiraKey)).toEqual(['WOSMVP-3'])
  })

  it('treats a task whose parentTaskId points nowhere as a root, rather than dropping it', () => {
    const tasks = [{ _id: 'a', parentTaskId: 'missing', jiraKey: 'WOSMVP-1' }]
    const tree = buildTaskTree(tasks)
    expect(tree.map((t) => t.jiraKey)).toEqual(['WOSMVP-1'])
  })
})

describe('trackAndSyncEpic', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    AtlasEpic.findOneAndUpdate.mockImplementation(async (filter: { jiraKey: string }, update: any) => ({
      _id: `epic-${filter.jiraKey}`,
      jiraKey: filter.jiraKey,
      ...update.$set,
      notes: '',
      archived: false,
    }))
    AtlasTask.findOneAndUpdate.mockImplementation(async (filter: { jiraKey: string }, update: any) => ({
      _id: `task-${filter.jiraKey}`,
      jiraKey: filter.jiraKey,
      ...update.$set,
      startDate: null,
      endDate: null,
      atRisk: false,
      notes: '',
      blockedBy: [],
      archived: false,
    }))
  })

  it('throws EpicNotFoundError and makes no search/upsert calls when the key does not resolve in Jira', async () => {
    bulkFetchIssues.mockResolvedValue({ issues: [], issueErrors: [{ issueId: 'WOSMVP-9999' }] })

    await expect(trackAndSyncEpic('WOSMVP-9999')).rejects.toThrow(EpicNotFoundError)
    expect(searchJql).not.toHaveBeenCalled()
    expect(AtlasEpic.findOneAndUpdate).not.toHaveBeenCalled()
  })

  it('throws NotAnEpicError and makes no search/upsert calls when the key resolves to a non-Epic issue', async () => {
    bulkFetchIssues.mockResolvedValue({
      issues: [issue('WOSMVP-100', { issuetype: { name: 'Story' } })],
      issueErrors: [],
    })

    await expect(trackAndSyncEpic('WOSMVP-100')).rejects.toThrow(NotAnEpicError)
    expect(searchJql).not.toHaveBeenCalled()
    expect(AtlasEpic.findOneAndUpdate).not.toHaveBeenCalled()
  })

  it('syncs an epic with no children: upserts the epic, no task fetch/upsert calls', async () => {
    bulkFetchIssues.mockResolvedValue({
      issues: [issue('WOSMVP-8262', { issuetype: { name: 'Epic' }, summary: 'The Epic' })],
      issueErrors: [],
    })
    searchJql.mockResolvedValue([])

    const result = await trackAndSyncEpic('WOSMVP-8262')

    expect(searchJql).toHaveBeenCalledWith('parent = "WOSMVP-8262"', expect.any(Array))
    expect(result.epic.jiraKey).toBe('WOSMVP-8262')
    expect(result.epic.title).toBe('The Epic')
    expect(result.epic.jiraUrl).toBe('https://wealthos.atlassian.net/browse/WOSMVP-8262')
    expect(result.tasks).toEqual([])
    expect(AtlasTask.findOneAndUpdate).not.toHaveBeenCalled()
  })

  it('recursively syncs a full task/sub-task tree: level-0 tasks via parent=<epicKey>, level-1 sub-tasks bulk-fetched from fields.subtasks', async () => {
    bulkFetchIssues
      .mockResolvedValueOnce({
        issues: [issue('WOSMVP-8262', { issuetype: { name: 'Epic' }, summary: 'The Epic' })],
        issueErrors: [],
      })
      .mockResolvedValueOnce({
        issues: [
          issue('WOSMVP-101', {
            summary: 'Do the sub-thing',
            issuetype: { name: 'Sub-task', subtask: true },
            status: { statusCategory: { key: 'indeterminate' } },
          }),
        ],
        issueErrors: [],
      })
    searchJql.mockResolvedValue([
      issue('WOSMVP-100', {
        summary: 'Do the thing',
        status: { statusCategory: { key: 'new' } },
        subtasks: [{ key: 'WOSMVP-101' }],
      }),
    ])

    const result = await trackAndSyncEpic('WOSMVP-8262')

    expect(bulkFetchIssues).toHaveBeenNthCalledWith(2, ['WOSMVP-101'], expect.any(Array))
    expect(result.tasks).toHaveLength(2)
    const task100 = result.tasks.find((t: any) => t.jiraKey === 'WOSMVP-100')
    const task101 = result.tasks.find((t: any) => t.jiraKey === 'WOSMVP-101')
    if (!task100 || !task101) throw new Error('expected both tasks to be synced')
    expect(task100.parentTaskId).toBeNull()
    expect(task100.epicId).toBe('epic-WOSMVP-8262')
    expect(task100.status).toBe('To Do')
    expect(task101.parentTaskId).toBe('task-WOSMVP-100')
    expect(task101.epicId).toBe('epic-WOSMVP-8262')
    expect(task101.status).toBe('In Progress')
  })

  it('does not make a second bulkFetchIssues call when no level-0 task has any sub-tasks', async () => {
    bulkFetchIssues.mockResolvedValueOnce({
      issues: [issue('WOSMVP-8262', { issuetype: { name: 'Epic' } })],
      issueErrors: [],
    })
    searchJql.mockResolvedValue([issue('WOSMVP-100', { subtasks: [] })])

    await trackAndSyncEpic('WOSMVP-8262')

    expect(bulkFetchIssues).toHaveBeenCalledTimes(1)
  })

  it('reads assigneeAccountId off fields.assignee, null when unassigned', async () => {
    bulkFetchIssues.mockResolvedValueOnce({
      issues: [issue('WOSMVP-8262', { issuetype: { name: 'Epic' } })],
      issueErrors: [],
    })
    searchJql.mockResolvedValue([
      issue('WOSMVP-100', { assignee: { accountId: 'acct-1', displayName: 'Ada', emailAddress: null } }),
    ])

    const result = await trackAndSyncEpic('WOSMVP-8262')

    expect(result.tasks[0].assigneeAccountId).toBe('acct-1')
  })

  it('only $set-updates Jira-sourced fields on the epic upsert, leaving notes/archived to $setOnInsert defaults', async () => {
    bulkFetchIssues.mockResolvedValue({
      issues: [issue('WOSMVP-8262', { issuetype: { name: 'Epic' } })],
      issueErrors: [],
    })
    searchJql.mockResolvedValue([])

    await trackAndSyncEpic('WOSMVP-8262')

    const [, update] = AtlasEpic.findOneAndUpdate.mock.calls[0]
    expect(Object.keys(update.$set)).toEqual(expect.arrayContaining(['title', 'jiraUrl', 'lastSyncedAt']))
    expect(Object.keys(update.$set)).not.toContain('notes')
    expect(Object.keys(update.$set)).not.toContain('archived')
  })

  it('only $set-updates Jira-sourced fields on a task upsert, leaving startDate/endDate/atRisk/atRiskOverride/notes/notesText/blockedBy/archived to $setOnInsert defaults', async () => {
    bulkFetchIssues.mockResolvedValueOnce({
      issues: [issue('WOSMVP-8262', { issuetype: { name: 'Epic' } })],
      issueErrors: [],
    })
    searchJql.mockResolvedValue([issue('WOSMVP-100')])

    await trackAndSyncEpic('WOSMVP-8262')

    const [, update] = AtlasTask.findOneAndUpdate.mock.calls[0]
    expect(Object.keys(update.$set)).toEqual(
      expect.arrayContaining(['epicId', 'parentTaskId', 'title', 'jiraUrl', 'assigneeAccountId', 'status']),
    )
    // atRisk/atRiskOverride specifically: this is what makes a manual
    // at-risk override (ticket 09, spec §5.1) survive this resync - see
    // utils/atlasRisk.ts's resolveAtRisk for how the two are combined.
    for (const localOnly of [
      'startDate',
      'endDate',
      'atRisk',
      'atRiskOverride',
      'notes',
      'notesText',
      'blockedBy',
      'archived',
    ]) {
      expect(Object.keys(update.$set)).not.toContain(localOnly)
    }
  })

  it("a manual at-risk override on an already-tracked task survives a resync (ticket 09's acceptance criterion)", async () => {
    bulkFetchIssues.mockResolvedValueOnce({
      issues: [issue('WOSMVP-8262', { issuetype: { name: 'Epic' } })],
      issueErrors: [],
    })
    searchJql.mockResolvedValue([issue('WOSMVP-100', { status: { statusCategory: { key: 'new' } } })])
    // Simulates Mongo's real findOneAndUpdate semantics for an *existing*
    // doc: only $set's keys are applied on top of whatever was already
    // there - a manually-overridden atRisk/atRiskOverride from a prior
    // PATCH (routes/atlasTasks.ts) is untouched since upsertAtlasTask's
    // $set never includes either field (see the test above).
    AtlasTask.findOneAndUpdate.mockImplementation(async (filter: { jiraKey: string }, update: any) => ({
      _id: `task-${filter.jiraKey}`,
      jiraKey: filter.jiraKey,
      startDate: null,
      endDate: '2026-01-01',
      atRisk: true,
      atRiskOverride: true,
      notes: null,
      notesText: '',
      blockedBy: [],
      archived: false,
      ...update.$set,
    }))

    const result = await trackAndSyncEpic('WOSMVP-8262')

    const task = result.tasks.find((t: any) => t.jiraKey === 'WOSMVP-100')
    expect(task?.atRisk).toBe(true)
    expect(task?.atRiskOverride).toBe(true)
  })
})
