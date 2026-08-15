import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import type { JiraIssue } from '../src/services/jiraClient.ts'

vi.mock('../src/services/jiraClient.ts', () => ({
  resolveBoard: vi.fn(),
  listSprints: vi.fn(),
  searchJql: vi.fn(),
  bulkFetchIssues: vi.fn(),
}))

// Mocked purely to prove searchBacklog never reaches for these - it has no
// import of any of these models at all, but asserting on the mocks (rather
// than just eyeballing the source) is what the ticket's checklist asks for,
// and it'll catch a regression if persistence is ever wired in here later.
const writeSpies = { findOneAndUpdate: vi.fn(), create: vi.fn(), updateOne: vi.fn(), insertMany: vi.fn() }
vi.mock('../src/models/Ticket.ts', () => ({ Ticket: { ...writeSpies } }))
vi.mock('../src/models/TicketDevQaOverride.ts', () => ({ TicketDevQaOverride: { ...writeSpies } }))
vi.mock('../src/models/TicketAssigneeOverride.ts', () => ({ TicketAssigneeOverride: { ...writeSpies } }))

const { resolveBoard, listSprints, searchJql, bulkFetchIssues } = (await import(
  '../src/services/jiraClient.ts'
)) as unknown as {
  resolveBoard: Mock
  listSprints: Mock
  searchJql: Mock
  bulkFetchIssues: Mock
}

const { searchBacklog } = await import('../src/services/backlogSearch.ts')

function issue(key: string, fields: Record<string, unknown> = {}): JiraIssue {
  return {
    id: key,
    key,
    fields: {
      summary: 'Some ticket title',
      issuetype: { name: 'Story', subtask: false },
      status: { name: 'To Do' },
      labels: [],
      assignee: null,
      subtasks: [],
      ...fields,
    },
  }
}

const BOARD = { id: 29, name: 'Product Delivery Board', type: 'scrum' }
const SPRINTS = [
  { id: 501, name: 'Tech and Ops Backlog', state: 'future' },
  { id: 502, name: 'Product Backlog', state: 'future' },
  { id: 503, name: 'Bug backlog', state: 'future' },
]

describe('searchBacklog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('resolves the Product Delivery Board and the category sprint, then runs JQL scoped to the sprint id and labels', async () => {
    resolveBoard.mockResolvedValue(BOARD)
    listSprints.mockResolvedValue(SPRINTS)
    searchJql.mockResolvedValue([])

    await searchBacklog('tech-ops', ['Odyssey'])

    expect(resolveBoard).toHaveBeenCalledWith('WOSMVP', 'Product Delivery Board')
    expect(listSprints).toHaveBeenCalledWith(29, ['future'])
    expect(searchJql).toHaveBeenCalledWith(
      'sprint = 501 AND labels in ("Odyssey") AND issuetype not in subtaskIssueTypes() AND issuetype != Epic AND status != Done ORDER BY Rank ASC',
      expect.arrayContaining(['summary', 'issuetype', 'labels', 'assignee', 'subtasks']),
    )
  })

  it('builds the JQL for the Product category against the Product Backlog sprint id', async () => {
    resolveBoard.mockResolvedValue(BOARD)
    listSprints.mockResolvedValue(SPRINTS)
    searchJql.mockResolvedValue([])

    await searchBacklog('product', ['Odyssey', 'Other'])

    expect(searchJql).toHaveBeenCalledWith(
      'sprint = 502 AND labels in ("Odyssey", "Other") AND issuetype not in subtaskIssueTypes() AND issuetype != Epic AND status != Done ORDER BY Rank ASC',
      expect.any(Array),
    )
  })

  it('builds the JQL for the Bug category against the Bug backlog sprint id', async () => {
    resolveBoard.mockResolvedValue(BOARD)
    listSprints.mockResolvedValue(SPRINTS)
    searchJql.mockResolvedValue([])

    await searchBacklog('bug', ['Odyssey'])

    expect(searchJql).toHaveBeenCalledWith(
      'sprint = 503 AND labels in ("Odyssey") AND issuetype not in subtaskIssueTypes() AND issuetype != Epic AND status != Done ORDER BY Rank ASC',
      expect.any(Array),
    )
  })

  it('preserves the board-rank order searchJql returns, without re-sorting', async () => {
    resolveBoard.mockResolvedValue(BOARD)
    listSprints.mockResolvedValue(SPRINTS)
    searchJql.mockResolvedValue([
      issue('WOSMVP-300', { summary: 'Third in rank', issuetype: { name: 'Task', subtask: false } }),
      issue('WOSMVP-100', { summary: 'First in rank', issuetype: { name: 'Task', subtask: false } }),
      issue('WOSMVP-200', { summary: 'Second in rank', issuetype: { name: 'Task', subtask: false } }),
    ])

    const result = await searchBacklog('tech-ops', ['Odyssey'])

    expect(result!.map((t) => t.key)).toEqual(['WOSMVP-300', 'WOSMVP-100', 'WOSMVP-200'])
  })

  it('resolves Dev/QA for a Story from its [Dev]/[Test] title-prefixed Sub-tasks', async () => {
    resolveBoard.mockResolvedValue(BOARD)
    listSprints.mockResolvedValue(SPRINTS)
    searchJql.mockResolvedValue([
      issue('WOSMVP-100', {
        summary: 'A story',
        issuetype: { name: 'Story', subtask: false },
        labels: ['Odyssey'],
        subtasks: [{ key: 'WOSMVP-101' }, { key: 'WOSMVP-102' }],
      }),
    ])
    bulkFetchIssues.mockResolvedValue({
      issues: [
        issue('WOSMVP-101', {
          summary: '[Dev]A story',
          issuetype: { name: 'Sub-task', subtask: true },
          assignee: { accountId: 'acct-dev', displayName: 'Dev Person', emailAddress: 'dev@example.com' },
        }),
        issue('WOSMVP-102', {
          summary: '[Test]A story',
          issuetype: { name: 'Sub-task', subtask: true },
          assignee: { accountId: 'acct-qa', displayName: 'QA Person', emailAddress: 'qa@example.com' },
        }),
      ],
      issueErrors: [],
    })

    const result = await searchBacklog('tech-ops', ['Odyssey'])

    expect(bulkFetchIssues).toHaveBeenCalledWith(['WOSMVP-101', 'WOSMVP-102'])
    expect(result).toEqual([
      {
        key: 'WOSMVP-100',
        title: 'A story',
        type: 'Story',
        labels: ['Odyssey'],
        dev: { name: 'Dev Person' },
        qa: { name: 'QA Person' },
        assignee: null,
      },
    ])
  })

  it('resolves Dev/QA for a Bug the same way as a Story', async () => {
    resolveBoard.mockResolvedValue(BOARD)
    listSprints.mockResolvedValue(SPRINTS)
    searchJql.mockResolvedValue([
      issue('WOSMVP-200', {
        summary: 'A bug',
        issuetype: { name: 'Bug', subtask: false },
        labels: ['Odyssey'],
        subtasks: [{ key: 'WOSMVP-201' }],
      }),
    ])
    bulkFetchIssues.mockResolvedValue({
      issues: [
        issue('WOSMVP-201', {
          summary: '[Dev]A bug',
          issuetype: { name: 'Sub-task', subtask: true },
          assignee: { accountId: 'acct-dev', displayName: 'Dev Person', emailAddress: 'dev@example.com' },
        }),
      ],
      issueErrors: [],
    })

    const result = await searchBacklog('bug', ['Odyssey'])

    expect(result).toEqual([
      {
        key: 'WOSMVP-200',
        title: 'A bug',
        type: 'Bug',
        labels: ['Odyssey'],
        dev: { name: 'Dev Person' },
        qa: null,
        assignee: null,
      },
    ])
  })

  it('a Story/Bug with an unassigned or missing role Sub-task resolves that role to null', async () => {
    resolveBoard.mockResolvedValue(BOARD)
    listSprints.mockResolvedValue(SPRINTS)
    searchJql.mockResolvedValue([
      issue('WOSMVP-100', {
        summary: 'A story',
        issuetype: { name: 'Story', subtask: false },
        subtasks: [{ key: 'WOSMVP-101' }],
      }),
    ])
    bulkFetchIssues.mockResolvedValue({
      issues: [
        issue('WOSMVP-101', {
          summary: '[Dev]A story',
          issuetype: { name: 'Sub-task', subtask: true },
          assignee: null,
        }),
      ],
      issueErrors: [],
    })

    const result = await searchBacklog('tech-ops', ['Odyssey'])

    expect(result![0].dev).toBeNull()
    expect(result![0].qa).toBeNull()
  })

  it('does not call bulkFetchIssues when there are no Story/Bug results (no Sub-tasks to resolve)', async () => {
    resolveBoard.mockResolvedValue(BOARD)
    listSprints.mockResolvedValue(SPRINTS)
    searchJql.mockResolvedValue([
      issue('WOSMVP-300', { summary: 'A task', issuetype: { name: 'Task', subtask: false } }),
    ])

    await searchBacklog('tech-ops', ['Odyssey'])

    expect(bulkFetchIssues).not.toHaveBeenCalled()
  })

  it('excludes a Sub-task that itself matches the sprint+label search from the results', async () => {
    resolveBoard.mockResolvedValue(BOARD)
    listSprints.mockResolvedValue(SPRINTS)
    searchJql.mockResolvedValue([
      issue('WOSMVP-300', { summary: 'A task', issuetype: { name: 'Task', subtask: false } }),
      issue('WOSMVP-301', { summary: '[Dev]A task', issuetype: { name: 'Sub-task', subtask: true } }),
    ])

    const result = await searchBacklog('tech-ops', ['Odyssey'])

    expect(result).toEqual([
      { key: 'WOSMVP-300', title: 'A task', type: 'Task', labels: [], dev: null, qa: null, assignee: null },
    ])
  })

  it('excludes an Epic that itself matches the sprint+label search from the results', async () => {
    resolveBoard.mockResolvedValue(BOARD)
    listSprints.mockResolvedValue(SPRINTS)
    searchJql.mockResolvedValue([
      issue('WOSMVP-300', { summary: 'A task', issuetype: { name: 'Task', subtask: false } }),
      issue('WOSMVP-400', { summary: 'An epic', issuetype: { name: 'Epic', subtask: false } }),
    ])

    const result = await searchBacklog('tech-ops', ['Odyssey'])

    expect(result).toEqual([
      { key: 'WOSMVP-300', title: 'A task', type: 'Task', labels: [], dev: null, qa: null, assignee: null },
    ])
  })

  it('excludes a Done ticket that itself matches the sprint+label search from the results', async () => {
    resolveBoard.mockResolvedValue(BOARD)
    listSprints.mockResolvedValue(SPRINTS)
    searchJql.mockResolvedValue([
      issue('WOSMVP-300', { summary: 'A task', issuetype: { name: 'Task', subtask: false } }),
      issue('WOSMVP-500', {
        summary: 'A done task',
        issuetype: { name: 'Task', subtask: false },
        status: { name: 'Done' },
      }),
    ])

    const result = await searchBacklog('tech-ops', ['Odyssey'])

    expect(result).toEqual([
      { key: 'WOSMVP-300', title: 'A task', type: 'Task', labels: [], dev: null, qa: null, assignee: null },
    ])
  })

  it('a Task uses its own plain assignee, no Sub-task lookup', async () => {
    resolveBoard.mockResolvedValue(BOARD)
    listSprints.mockResolvedValue(SPRINTS)
    searchJql.mockResolvedValue([
      issue('WOSMVP-300', {
        summary: 'A task',
        issuetype: { name: 'Task', subtask: false },
        assignee: { accountId: 'acct-1', displayName: 'Task Owner', emailAddress: 'owner@example.com' },
      }),
    ])

    const result = await searchBacklog('tech-ops', ['Odyssey'])

    expect(result).toEqual([
      {
        key: 'WOSMVP-300',
        title: 'A task',
        type: 'Task',
        labels: [],
        dev: null,
        qa: null,
        assignee: { name: 'Task Owner' },
      },
    ])
  })

  it('an unassigned Task resolves assignee to null', async () => {
    resolveBoard.mockResolvedValue(BOARD)
    listSprints.mockResolvedValue(SPRINTS)
    searchJql.mockResolvedValue([
      issue('WOSMVP-300', { summary: 'A task', issuetype: { name: 'Task', subtask: false }, assignee: null }),
    ])

    const result = await searchBacklog('tech-ops', ['Odyssey'])

    expect(result![0].assignee).toBeNull()
  })

  it('never writes to Ticket, TicketDevQaOverride, or TicketAssigneeOverride as a side effect', async () => {
    resolveBoard.mockResolvedValue(BOARD)
    listSprints.mockResolvedValue(SPRINTS)
    searchJql.mockResolvedValue([
      issue('WOSMVP-100', {
        summary: 'A story',
        issuetype: { name: 'Story', subtask: false },
        subtasks: [{ key: 'WOSMVP-101' }, { key: 'WOSMVP-102' }],
      }),
      issue('WOSMVP-300', {
        summary: 'A task',
        issuetype: { name: 'Task', subtask: false },
        assignee: { accountId: 'acct-1', displayName: 'Task Owner', emailAddress: 'owner@example.com' },
      }),
    ])
    bulkFetchIssues.mockResolvedValue({
      issues: [
        issue('WOSMVP-101', { summary: '[Dev]A story', assignee: { accountId: 'acct-dev', displayName: 'Dev Person' } }),
        issue('WOSMVP-102', { summary: '[Test]A story', assignee: { accountId: 'acct-qa', displayName: 'QA Person' } }),
      ],
      issueErrors: [],
    })

    await searchBacklog('tech-ops', ['Odyssey'])

    for (const spy of Object.values(writeSpies)) {
      expect(spy).not.toHaveBeenCalled()
    }
  })

  it('returns an empty list without calling Jira at all when jiraLabels is empty', async () => {
    const result = await searchBacklog('tech-ops', [])

    expect(result).toEqual([])
    expect(resolveBoard).not.toHaveBeenCalled()
    expect(listSprints).not.toHaveBeenCalled()
    expect(searchJql).not.toHaveBeenCalled()
    expect(bulkFetchIssues).not.toHaveBeenCalled()
  })

  it('returns null when the Product Delivery Board cannot be resolved', async () => {
    resolveBoard.mockResolvedValue(null)

    const result = await searchBacklog('tech-ops', ['Odyssey'])

    expect(result).toBeNull()
    expect(listSprints).not.toHaveBeenCalled()
  })

  it('returns null when the named backlog sprint is not found on the board', async () => {
    resolveBoard.mockResolvedValue(BOARD)
    listSprints.mockResolvedValue([{ id: 999, name: 'Some Other Sprint', state: 'future' }])

    const result = await searchBacklog('tech-ops', ['Odyssey'])

    expect(result).toBeNull()
    expect(searchJql).not.toHaveBeenCalled()
  })
})
