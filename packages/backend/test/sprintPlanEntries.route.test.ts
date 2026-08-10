import request from 'supertest'
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import type { JiraIssue } from '../src/services/jiraClient.ts'

vi.mock('../src/services/jiraClient.ts', () => ({
  bulkFetchIssues: vi.fn(),
}))

interface MockedTicketModel {
  findOne: Mock
  findOneAndUpdate: Mock
}

vi.mock('../src/models/Ticket.ts', () => ({
  Ticket: {
    findOne: vi.fn(),
    findOneAndUpdate: vi.fn(),
  },
}))

interface MockedSprintPlanEntryModel {
  find: Mock
  findOne: Mock
  create: Mock
  findByIdAndUpdate: Mock
}

vi.mock('../src/models/SprintPlanEntry.ts', () => ({
  SprintPlanEntry: {
    find: vi.fn(),
    findOne: vi.fn(),
    create: vi.fn(),
    findByIdAndUpdate: vi.fn(),
  },
}))

vi.mock('../src/services/statusSync.ts', () => ({
  refreshStatusSet: vi.fn(),
}))

const { bulkFetchIssues } = (await import('../src/services/jiraClient.ts')) as unknown as { bulkFetchIssues: Mock }
const { Ticket } = (await import('../src/models/Ticket.ts')) as unknown as { Ticket: MockedTicketModel }
const { SprintPlanEntry } = (await import('../src/models/SprintPlanEntry.ts')) as unknown as {
  SprintPlanEntry: MockedSprintPlanEntryModel
}
const { createApp } = await import('../src/app.ts')

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

// Mimics a Mongoose query's `.find(...).populate(...)` chain (resolves
// directly, since callers `await` it as-is) that can *also* have `.sort()`
// chained off it (the GET list endpoint) — both resolve to the same result.
function populateChain(result: unknown) {
  const promise = Promise.resolve(result) as Promise<unknown> & { sort: Mock }
  promise.sort = vi.fn().mockResolvedValue(result)
  return promise
}
function findWithPopulate(result: unknown) {
  return { populate: vi.fn().mockReturnValue(populateChain(result)) }
}

describe('SprintPlanEntry routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('POST /api/sprint-plan-entries', () => {
    it('rejects a missing teamId/sprintId/jiraKey', async () => {
      const app = createApp()
      const res = await request(app).post('/api/sprint-plan-entries').send({ teamId: 't1' })

      expect(res.status).toBe(400)
      expect(bulkFetchIssues).not.toHaveBeenCalled()
    })

    it('Full syncs the ticket and its sub-tasks, upserting a Ticket doc for each, then adds the parent to the plan at order 0', async () => {
      bulkFetchIssues
        .mockResolvedValueOnce({
          issues: [issue('WOSMVP-100', { subtasks: [{ key: 'WOSMVP-101' }] })],
          issueErrors: [],
        })
        .mockResolvedValueOnce({
          issues: [issue('WOSMVP-101', { issuetype: { name: 'Sub-task', subtask: true } })],
          issueErrors: [],
        })

      Ticket.findOne.mockResolvedValue(null)
      Ticket.findOneAndUpdate
        .mockResolvedValueOnce({ _id: 't-100', jiraKey: 'WOSMVP-100', assigneeAccountId: null })
        .mockResolvedValueOnce({ _id: 't-101', jiraKey: 'WOSMVP-101', assigneeAccountId: null })

      SprintPlanEntry.find.mockReturnValue(findWithPopulate([]))
      const populatedEntry = {
        _id: 'entry-1',
        teamId: 'team-1',
        sprintId: 'sprint-1',
        ticketId: { _id: 't-100', jiraKey: 'WOSMVP-100' },
        order: 0,
      }
      SprintPlanEntry.create.mockResolvedValue({
        ...populatedEntry,
        ticketId: 't-100',
        populate: vi.fn().mockResolvedValue(populatedEntry),
      })

      const app = createApp()
      const res = await request(app)
        .post('/api/sprint-plan-entries')
        .send({ teamId: 'team-1', sprintId: 'sprint-1', jiraKey: 'WOSMVP-100' })

      expect(res.status).toBe(201)
      expect(res.body).toEqual(populatedEntry)
      expect(bulkFetchIssues).toHaveBeenNthCalledWith(1, ['WOSMVP-100'])
      expect(bulkFetchIssues).toHaveBeenNthCalledWith(2, ['WOSMVP-101'])
      expect(Ticket.findOneAndUpdate).toHaveBeenCalledTimes(2)
      expect(SprintPlanEntry.create).toHaveBeenCalledWith({
        teamId: 'team-1',
        sprintId: 'sprint-1',
        ticketId: 't-100',
        order: 0,
      })
    })

    it('places a new entry at the end of its assignee current row (max order + 1)', async () => {
      bulkFetchIssues.mockResolvedValueOnce({
        issues: [issue('WOSMVP-200', { assignee: { accountId: 'acct-a' } })],
        issueErrors: [],
      })
      Ticket.findOne.mockResolvedValue(null)
      Ticket.findOneAndUpdate.mockResolvedValueOnce({ _id: 't-200', jiraKey: 'WOSMVP-200', assigneeAccountId: 'acct-a' })

      // Existing plan already has two entries for acct-a (orders 0 and 2) and one for someone else.
      SprintPlanEntry.find.mockReturnValue(
        findWithPopulate([
          { order: 0, ticketId: { _id: 'other-1', assigneeAccountId: 'acct-a' } },
          { order: 2, ticketId: { _id: 'other-2', assigneeAccountId: 'acct-a' } },
          { order: 9, ticketId: { _id: 'other-3', assigneeAccountId: 'acct-b' } },
        ]),
      )
      SprintPlanEntry.create.mockResolvedValue({
        populate: vi.fn().mockResolvedValue({ _id: 'entry-2', order: 3 }),
      })

      const app = createApp()
      await request(app)
        .post('/api/sprint-plan-entries')
        .send({ teamId: 'team-1', sprintId: 'sprint-1', jiraKey: 'WOSMVP-200' })

      expect(SprintPlanEntry.create).toHaveBeenCalledWith(
        expect.objectContaining({ ticketId: 't-200', order: 3 }),
      )
    })

    it('returns 409 when the ticket is already in the plan for this team+sprint', async () => {
      bulkFetchIssues.mockResolvedValueOnce({ issues: [issue('WOSMVP-1')], issueErrors: [] })
      Ticket.findOne.mockResolvedValue(null)
      Ticket.findOneAndUpdate.mockResolvedValueOnce({ _id: 't-1', jiraKey: 'WOSMVP-1', assigneeAccountId: null })
      SprintPlanEntry.find.mockReturnValue(findWithPopulate([]))
      SprintPlanEntry.create.mockRejectedValue({ code: 11000 })

      const app = createApp()
      const res = await request(app)
        .post('/api/sprint-plan-entries')
        .send({ teamId: 'team-1', sprintId: 'sprint-1', jiraKey: 'WOSMVP-1' })

      expect(res.status).toBe(409)
    })
  })

  describe('GET /api/sprint-plan-entries', () => {
    it('rejects missing teamId/sprintId', async () => {
      const app = createApp()
      const res = await request(app).get('/api/sprint-plan-entries').query({ teamId: 't1' })
      expect(res.status).toBe(400)
    })

    it('lists the plan with Ticket populated, sorted by order', async () => {
      const docs = [{ _id: 'e1', order: 0, ticketId: { jiraKey: 'WOSMVP-1' } }]
      SprintPlanEntry.find.mockReturnValue(findWithPopulate(docs))

      const app = createApp()
      const res = await request(app).get('/api/sprint-plan-entries').query({ teamId: 't1', sprintId: 's1' })

      expect(res.status).toBe(200)
      expect(SprintPlanEntry.find).toHaveBeenCalledWith({ teamId: 't1', sprintId: 's1' })
      expect(res.body).toEqual(docs)
    })
  })

  describe('POST /api/sprint-plan-entries/sync', () => {
    it('Full syncs every ticket already in the plan, batched into one bulkFetchIssues call', async () => {
      SprintPlanEntry.find
        .mockReturnValueOnce(
          findWithPopulate([
            { ticketId: { jiraKey: 'WOSMVP-1' } },
            { ticketId: { jiraKey: 'WOSMVP-2' } },
          ]),
        )
        // No reassignment in this test (assignees stay null), so no
        // nextOrderForAssignee call happens in between — this is the final
        // refresh.
        .mockReturnValueOnce(findWithPopulate([{ order: 0, ticketId: { jiraKey: 'WOSMVP-1' } }]))

      bulkFetchIssues.mockResolvedValueOnce({
        issues: [issue('WOSMVP-1'), issue('WOSMVP-2')],
        issueErrors: [],
      })
      Ticket.findOne.mockResolvedValue({ jiraKey: 'WOSMVP-1', assigneeAccountId: null })
      Ticket.findOneAndUpdate.mockImplementation(async (filter: { jiraKey: string }) => ({
        _id: `id-${filter.jiraKey}`,
        jiraKey: filter.jiraKey,
        assigneeAccountId: null,
      }))

      const app = createApp()
      const res = await request(app).post('/api/sprint-plan-entries/sync').send({ teamId: 't1', sprintId: 's1' })

      expect(res.status).toBe(200)
      expect(bulkFetchIssues).toHaveBeenCalledTimes(1)
      expect(bulkFetchIssues).toHaveBeenCalledWith(['WOSMVP-1', 'WOSMVP-2'])
    })

    it('resets a reassigned ticket entry order to the end of its new assignee row', async () => {
      // Plan has entry A (ticket TA, currently acct-x) and entry B (ticket TB, acct-y, order 5).
      // Sync discovers TA's assignee changed to acct-y -> A's order should become 6 (after B's 5).
      SprintPlanEntry.find
        .mockReturnValueOnce(
          findWithPopulate([
            { ticketId: { _id: 'ta', jiraKey: 'WOSMVP-300' } },
            { ticketId: { _id: 'tb', jiraKey: 'WOSMVP-301' } },
          ]),
        ) // gather plan jiraKeys
        .mockReturnValueOnce(
          findWithPopulate([
            { order: 0, ticketId: { _id: 'ta', assigneeAccountId: 'acct-y' } },
            { order: 5, ticketId: { _id: 'tb', assigneeAccountId: 'acct-y' } },
          ]),
        ) // nextOrderForAssignee, excluding ta
        .mockReturnValueOnce(findWithPopulate([])) // final refresh

      bulkFetchIssues.mockResolvedValueOnce({
        issues: [
          issue('WOSMVP-300', { assignee: { accountId: 'acct-y' } }),
          issue('WOSMVP-301', { assignee: { accountId: 'acct-y' } }),
        ],
        issueErrors: [],
      })
      Ticket.findOne.mockImplementation(async (filter: { jiraKey: string }) => {
        if (filter.jiraKey === 'WOSMVP-300') return { jiraKey: 'WOSMVP-300', assigneeAccountId: 'acct-x' }
        return { jiraKey: 'WOSMVP-301', assigneeAccountId: 'acct-y' }
      })
      Ticket.findOneAndUpdate.mockImplementation(async (filter: { jiraKey: string }) => {
        if (filter.jiraKey === 'WOSMVP-300') return { _id: 'ta', jiraKey: 'WOSMVP-300', assigneeAccountId: 'acct-y' }
        return { _id: 'tb', jiraKey: 'WOSMVP-301', assigneeAccountId: 'acct-y' }
      })

      const entryA = { _id: 'e-A', order: 0, save: vi.fn().mockResolvedValue(undefined) }
      SprintPlanEntry.findOne.mockResolvedValue(entryA)

      const app = createApp()
      const res = await request(app).post('/api/sprint-plan-entries/sync').send({ teamId: 't1', sprintId: 's1' })

      expect(res.status).toBe(200)
      expect(SprintPlanEntry.findOne).toHaveBeenCalledWith({ teamId: 't1', sprintId: 's1', ticketId: 'ta' })
      expect(entryA.order).toBe(6)
      expect(entryA.save).toHaveBeenCalledTimes(1)
    })

    it('does not reset order for a ticket whose assignee is unchanged', async () => {
      SprintPlanEntry.find
        .mockReturnValueOnce(findWithPopulate([{ ticketId: { _id: 'ta', jiraKey: 'WOSMVP-400' } }]))
        .mockReturnValueOnce(findWithPopulate([]))

      bulkFetchIssues.mockResolvedValueOnce({
        issues: [issue('WOSMVP-400', { assignee: { accountId: 'acct-x' } })],
        issueErrors: [],
      })
      Ticket.findOne.mockResolvedValue({ jiraKey: 'WOSMVP-400', assigneeAccountId: 'acct-x' })
      Ticket.findOneAndUpdate.mockResolvedValue({ _id: 'ta', jiraKey: 'WOSMVP-400', assigneeAccountId: 'acct-x' })

      const app = createApp()
      await request(app).post('/api/sprint-plan-entries/sync').send({ teamId: 't1', sprintId: 's1' })

      expect(SprintPlanEntry.findOne).not.toHaveBeenCalled()
    })

    it('rejects a missing teamId/sprintId', async () => {
      const app = createApp()
      const res = await request(app).post('/api/sprint-plan-entries/sync').send({ teamId: 't1' })
      expect(res.status).toBe(400)
      expect(bulkFetchIssues).not.toHaveBeenCalled()
    })
  })

  describe('PATCH /api/sprint-plan-entries/:id', () => {
    it('updates order', async () => {
      const populate = vi.fn().mockResolvedValue({ _id: 'e1', order: 4 })
      SprintPlanEntry.findByIdAndUpdate.mockReturnValue({ populate })

      const app = createApp()
      const res = await request(app).patch('/api/sprint-plan-entries/e1').send({ order: 4 })

      expect(res.status).toBe(200)
      expect(SprintPlanEntry.findByIdAndUpdate).toHaveBeenCalledWith('e1', { order: 4 }, { new: true })
      expect(populate).toHaveBeenCalledWith('ticketId')
    })

    it('rejects a non-numeric order', async () => {
      const app = createApp()
      const res = await request(app).patch('/api/sprint-plan-entries/e1').send({ order: 'first' })
      expect(res.status).toBe(400)
      expect(SprintPlanEntry.findByIdAndUpdate).not.toHaveBeenCalled()
    })

    it('returns 404 when the entry does not exist', async () => {
      const populate = vi.fn().mockResolvedValue(null)
      SprintPlanEntry.findByIdAndUpdate.mockReturnValue({ populate })

      const app = createApp()
      const res = await request(app).patch('/api/sprint-plan-entries/nope').send({ order: 1 })
      expect(res.status).toBe(404)
    })
  })
})
