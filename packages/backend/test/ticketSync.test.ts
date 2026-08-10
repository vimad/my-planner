import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import type { JiraIssue } from '../src/services/jiraClient.ts'

vi.mock('../src/services/jiraClient.ts', () => ({
  bulkFetchIssues: vi.fn(),
}))

interface MockedTicketModel {
  findOne: Mock
  findOneAndUpdate: Mock
  find: Mock
}

vi.mock('../src/models/Ticket.ts', () => ({
  Ticket: {
    findOne: vi.fn(),
    findOneAndUpdate: vi.fn(),
    find: vi.fn(),
  },
}))

const { bulkFetchIssues } = (await import('../src/services/jiraClient.ts')) as unknown as { bulkFetchIssues: Mock }
const { Ticket } = (await import('../src/models/Ticket.ts')) as unknown as { Ticket: MockedTicketModel }
const { mapIssueToTicketFields, fullSyncTickets, computeEffortHours } = await import('../src/services/ticketSync.ts')

function issue(key: string, fields: Record<string, unknown> = {}): JiraIssue {
  return {
    id: key,
    key,
    fields: {
      summary: 'Some ticket title',
      issuetype: { name: 'Story', subtask: false },
      status: { name: 'To Do' },
      assignee: null,
      labels: [],
      ...fields,
    },
  }
}

describe('mapIssueToTicketFields', () => {
  const syncedAt = new Date('2026-08-10T00:00:00Z')

  it('maps title/status/type/labels straight through', () => {
    const mapped = mapIssueToTicketFields(
      issue('WOSMVP-1', { summary: 'Fix the thing', status: { name: 'In Progress' }, labels: ['Odyssey', 'x'] }),
      syncedAt,
    )
    expect(mapped.jiraKey).toBe('WOSMVP-1')
    expect(mapped.title).toBe('Fix the thing')
    expect(mapped.status).toBe('In Progress')
    expect(mapped.type).toBe('Story')
    expect(mapped.labels).toEqual(['Odyssey', 'x'])
    expect(mapped.lastSyncedAt).toBe(syncedAt)
  })

  it('maps assignee accountId/displayName/emailAddress, and null when unassigned', () => {
    const assigned = mapIssueToTicketFields(
      issue('WOSMVP-1', {
        assignee: { accountId: 'acct-1', displayName: 'Ada Lovelace', emailAddress: 'ada@example.com' },
      }),
      syncedAt,
    )
    expect(assigned.assigneeAccountId).toBe('acct-1')
    expect(assigned.assigneeDisplayName).toBe('Ada Lovelace')
    expect(assigned.assigneeEmail).toBe('ada@example.com')

    const unassigned = mapIssueToTicketFields(issue('WOSMVP-2', { assignee: null }), syncedAt)
    expect(unassigned.assigneeAccountId).toBeNull()
    expect(unassigned.assigneeDisplayName).toBeNull()
    expect(unassigned.assigneeEmail).toBeNull()
  })

  it('treats emailAddress: null on assignee as unmapped-display, not a match key (ADR 0001)', () => {
    const mapped = mapIssueToTicketFields(
      issue('WOSMVP-1', { assignee: { accountId: 'acct-1', displayName: 'Ada', emailAddress: null } }),
      syncedAt,
    )
    expect(mapped.assigneeAccountId).toBe('acct-1')
    expect(mapped.assigneeEmail).toBeNull()
  })

  it('converts timeoriginalestimate seconds to hours, and null when absent', () => {
    const withEstimate = mapIssueToTicketFields(issue('WOSMVP-1', { timeoriginalestimate: 28800 }), syncedAt)
    expect(withEstimate.estimateHours).toBe(8)

    const withoutEstimate = mapIssueToTicketFields(issue('WOSMVP-2', { timeoriginalestimate: null }), syncedAt)
    expect(withoutEstimate.estimateHours).toBeNull()
  })

  it('reads the Stream custom field (customfield_10240) select option value', () => {
    const mapped = mapIssueToTicketFields(
      issue('WOSMVP-1', { customfield_10240: { value: 'Product Roadmap', id: '10247' } }),
      syncedAt,
    )
    expect(mapped.stream).toBe('Product Roadmap')

    const withoutStream = mapIssueToTicketFields(issue('WOSMVP-2', {}), syncedAt)
    expect(withoutStream.stream).toBeNull()
  })

  it('sets epicKey (not parentKey) when the parent issue is an Epic', () => {
    const mapped = mapIssueToTicketFields(
      issue('WOSMVP-1', {
        parent: { key: 'WOSMVP-500', fields: { issuetype: { name: 'Epic' } } },
      }),
      syncedAt,
    )
    expect(mapped.epicKey).toBe('WOSMVP-500')
    expect(mapped.parentKey).toBeNull()
  })

  it('sets parentKey (not epicKey) when the parent issue is a Story/Bug/Task', () => {
    const mapped = mapIssueToTicketFields(
      issue('WOSMVP-101', {
        issuetype: { name: 'Sub-task', subtask: true },
        parent: { key: 'WOSMVP-100', fields: { issuetype: { name: 'Story' } } },
      }),
      syncedAt,
    )
    expect(mapped.parentKey).toBe('WOSMVP-100')
    expect(mapped.epicKey).toBeNull()
  })

  it('leaves both epicKey and parentKey null when there is no parent', () => {
    const mapped = mapIssueToTicketFields(issue('WOSMVP-1', { parent: undefined }), syncedAt)
    expect(mapped.epicKey).toBeNull()
    expect(mapped.parentKey).toBeNull()
  })

  it.each([
    ['[Dev]Beneficiary leaver inclusion in FPS', 'Dev'],
    ['[Test]Beneficiary leaver inclusion in FPS', 'Test'],
    ['Beneficiary leaver inclusion in FPS', null],
  ] as const)('parses subtaskKind from title %s -> %s', (title, expected) => {
    const mapped = mapIssueToTicketFields(issue('WOSMVP-1', { summary: title }), syncedAt)
    expect(mapped.subtaskKind).toBe(expected)
  })

  it('currentSprintKey takes the last (current) entry of the Sprint field, ignoring earlier closed sprints', () => {
    const mapped = mapIssueToTicketFields(
      issue('WOSMVP-1', {
        customfield_10020: [
          { id: 630, state: 'closed' },
          { id: 631, state: 'closed' },
          { id: 632, state: 'active' },
        ],
      }),
      syncedAt,
    )
    expect(mapped.currentSprintKey).toBe('632')
  })

  it('currentSprintKey is null when the Sprint field is empty or absent', () => {
    expect(mapIssueToTicketFields(issue('WOSMVP-1', { customfield_10020: [] }), syncedAt).currentSprintKey).toBeNull()
    expect(mapIssueToTicketFields(issue('WOSMVP-2', {}), syncedAt).currentSprintKey).toBeNull()
  })
})

describe('fullSyncTickets', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns [] and never calls Jira when given no keys', async () => {
    const result = await fullSyncTickets([])
    expect(result).toEqual([])
    expect(bulkFetchIssues).not.toHaveBeenCalled()
  })

  it('Full syncs a ticket and follows its sub-tasks in a second bulkFetchIssues call, upserting a Ticket doc for each', async () => {
    bulkFetchIssues
      .mockResolvedValueOnce({
        issues: [issue('WOSMVP-100', { subtasks: [{ key: 'WOSMVP-101' }, { key: 'WOSMVP-102' }] })],
        issueErrors: [],
      })
      .mockResolvedValueOnce({
        issues: [
          issue('WOSMVP-101', { summary: '[Dev]Do the thing', issuetype: { name: 'Sub-task', subtask: true } }),
          issue('WOSMVP-102', { summary: '[Test]Do the thing', issuetype: { name: 'Sub-task', subtask: true } }),
        ],
        issueErrors: [],
      })

    Ticket.findOne.mockResolvedValue(null)
    Ticket.findOneAndUpdate.mockImplementation(async (filter: { jiraKey: string }) => ({
      _id: `id-${filter.jiraKey}`,
      jiraKey: filter.jiraKey,
      assigneeAccountId: null,
    }))

    const synced = await fullSyncTickets(['WOSMVP-100'])

    expect(bulkFetchIssues).toHaveBeenNthCalledWith(1, ['WOSMVP-100'])
    expect(bulkFetchIssues).toHaveBeenNthCalledWith(2, ['WOSMVP-101', 'WOSMVP-102'])
    expect(Ticket.findOneAndUpdate).toHaveBeenCalledTimes(3)
    expect(synced.map((s) => s.ticket.jiraKey)).toEqual(['WOSMVP-100', 'WOSMVP-101', 'WOSMVP-102'])
    expect(synced.every((s) => s.isNew)).toBe(true)
  })

  it('does not make a second Jira call when the ticket has no sub-tasks', async () => {
    bulkFetchIssues.mockResolvedValueOnce({ issues: [issue('WOSMVP-1', { subtasks: [] })], issueErrors: [] })
    Ticket.findOne.mockResolvedValue(null)
    Ticket.findOneAndUpdate.mockResolvedValue({ _id: 'id-1', jiraKey: 'WOSMVP-1', assigneeAccountId: null })

    await fullSyncTickets(['WOSMVP-1'])

    expect(bulkFetchIssues).toHaveBeenCalledTimes(1)
  })

  it('reports the previous assigneeAccountId and isNew: false for a ticket that already existed', async () => {
    bulkFetchIssues.mockResolvedValueOnce({
      issues: [issue('WOSMVP-1', { assignee: { accountId: 'acct-new' } })],
      issueErrors: [],
    })
    Ticket.findOne.mockResolvedValue({ jiraKey: 'WOSMVP-1', assigneeAccountId: 'acct-old' })
    Ticket.findOneAndUpdate.mockResolvedValue({ _id: 'id-1', jiraKey: 'WOSMVP-1', assigneeAccountId: 'acct-new' })

    const [synced] = await fullSyncTickets(['WOSMVP-1'])

    expect(synced.isNew).toBe(false)
    expect(synced.previousAssigneeAccountId).toBe('acct-old')
    expect(synced.ticket.assigneeAccountId).toBe('acct-new')
  })
})

describe('computeEffortHours', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('falls back to the ticket own estimateHours when it has no sub-tasks', async () => {
    Ticket.find.mockResolvedValue([])
    const effort = await computeEffortHours({ jiraKey: 'WOSMVP-1', estimateHours: 12 })
    expect(Ticket.find).toHaveBeenCalledWith({ parentKey: 'WOSMVP-1' })
    expect(effort).toBe(12)
  })

  it('uses the single sub-task estimate, ignoring the parent own estimate, when exactly one sub-task exists', async () => {
    Ticket.find.mockResolvedValue([{ estimateHours: 5 }])
    const effort = await computeEffortHours({ jiraKey: 'WOSMVP-1', estimateHours: 999 })
    expect(effort).toBe(5)
  })

  it('sums estimateHours across two+ sub-tasks, treating a null estimate as 0', async () => {
    Ticket.find.mockResolvedValue([{ estimateHours: 4 }, { estimateHours: null }, { estimateHours: 3 }])
    const effort = await computeEffortHours({ jiraKey: 'WOSMVP-1', estimateHours: null })
    expect(effort).toBe(7)
  })
})
