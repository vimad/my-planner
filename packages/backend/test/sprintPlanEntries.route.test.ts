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

interface MockedTeamMembershipModel {
  find: Mock
}

vi.mock('../src/models/TeamMembership.ts', () => ({
  TeamMembership: { find: vi.fn() },
}))

interface MockedTicketDevQaOverrideModel {
  findOne: Mock
}

vi.mock('../src/models/TicketDevQaOverride.ts', () => ({
  TicketDevQaOverride: { findOne: vi.fn() },
}))

interface MockedTicketAssigneeOverrideModel {
  find: Mock
}

vi.mock('../src/models/TicketAssigneeOverride.ts', () => ({
  TicketAssigneeOverride: { find: vi.fn() },
}))

// isSplitTicket is real (a trivial pure predicate) — only resolveDevQa (the
// DB-touching part) is mocked, same posture as capacity.route.test.ts. Its
// own resolution logic gets its own coverage in devQaResolution.test.ts;
// this file is only about sprintPlanEntries.ts's wiring around it (GET's
// inlined devQa, POST's devOrder/qaOrder seeding, and the reassignment
// reset extension).
vi.mock('../src/services/devQaResolution.ts', () => ({
  isSplitTicket: (type: unknown) => type === 'Story' || type === 'Bug',
  resolveDevQa: vi.fn(),
  roleSubtaskEstimateHours: vi.fn(),
}))

vi.mock('../src/services/statusSync.ts', () => ({
  refreshStatusSet: vi.fn(),
}))

const { bulkFetchIssues } = (await import('../src/services/jiraClient.ts')) as unknown as { bulkFetchIssues: Mock }
const { Ticket } = (await import('../src/models/Ticket.ts')) as unknown as { Ticket: MockedTicketModel }
const { SprintPlanEntry } = (await import('../src/models/SprintPlanEntry.ts')) as unknown as {
  SprintPlanEntry: MockedSprintPlanEntryModel
}
const { TeamMembership } = (await import('../src/models/TeamMembership.ts')) as unknown as {
  TeamMembership: MockedTeamMembershipModel
}
const { TicketDevQaOverride } = (await import('../src/models/TicketDevQaOverride.ts')) as unknown as {
  TicketDevQaOverride: MockedTicketDevQaOverrideModel
}
const { TicketAssigneeOverride } = (await import('../src/models/TicketAssigneeOverride.ts')) as unknown as {
  TicketAssigneeOverride: MockedTicketAssigneeOverrideModel
}
const { resolveDevQa, roleSubtaskEstimateHours } = (await import('../src/services/devQaResolution.ts')) as unknown as {
  resolveDevQa: Mock
  roleSubtaskEstimateHours: Mock
}
const { createApp } = await import('../src/app.ts')

function withMembershipPopulate(result: unknown) {
  return { populate: vi.fn().mockResolvedValue(result) }
}

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
    // Default: no Assignee Override recorded for any ticket - only the GET
    // tests that specifically exercise the Override need to override this.
    TicketAssigneeOverride.find.mockResolvedValue([])
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

    it('seeds devOrder for a newly added Split ticket whose dev role resolves immediately, leaving qaOrder unset while qa is needs-assignment', async () => {
      bulkFetchIssues.mockResolvedValueOnce({
        issues: [issue('WOSMVP-600', { issuetype: { name: 'Story', subtask: false } })],
        issueErrors: [],
      })
      Ticket.findOne.mockResolvedValue(null)
      Ticket.findOneAndUpdate.mockResolvedValueOnce({
        _id: 't-600',
        jiraKey: 'WOSMVP-600',
        type: 'Story',
        assigneeAccountId: null,
      })

      // Both nextOrderForAssignee (order) and nextOrderForRole (devOrder)
      // see an otherwise-empty plan here — this test is about the seeding
      // wiring, not row-placement math (that's nextOrderForAssignee's own
      // existing "places a new entry..." test, mirrored for devOrder below).
      SprintPlanEntry.find.mockReturnValue(findWithPopulate([]))
      TeamMembership.find.mockReturnValue(withMembershipPopulate([{ personId: { _id: 'p1', jiraAccountId: 'acct-dev' } }]))
      resolveDevQa.mockResolvedValue({
        dev: { status: 'resolved', source: 'subtask', personId: 'p1' },
        qa: { status: 'needs-assignment' },
      })

      SprintPlanEntry.create.mockResolvedValue({
        populate: vi.fn().mockResolvedValue({ _id: 'entry-600', order: 0, devOrder: 0 }),
      })

      const app = createApp()
      const res = await request(app)
        .post('/api/sprint-plan-entries')
        .send({ teamId: 'team-1', sprintId: 'sprint-1', jiraKey: 'WOSMVP-600' })

      expect(res.status).toBe(201)
      expect(SprintPlanEntry.create).toHaveBeenCalledWith({
        teamId: 'team-1',
        sprintId: 'sprint-1',
        ticketId: 't-600',
        order: 0,
        devOrder: 0,
      })
    })

    it('does not resolve dev/qa or touch TeamMembership when the added ticket is not a Split ticket', async () => {
      bulkFetchIssues.mockResolvedValueOnce({
        issues: [issue('WOSMVP-601', { issuetype: { name: 'Task', subtask: false } })],
        issueErrors: [],
      })
      Ticket.findOne.mockResolvedValue(null)
      Ticket.findOneAndUpdate.mockResolvedValueOnce({
        _id: 't-601',
        jiraKey: 'WOSMVP-601',
        type: 'Task',
        assigneeAccountId: null,
      })
      SprintPlanEntry.find.mockReturnValue(findWithPopulate([]))
      SprintPlanEntry.create.mockResolvedValue({ populate: vi.fn().mockResolvedValue({ _id: 'entry-601' }) })

      const app = createApp()
      await request(app)
        .post('/api/sprint-plan-entries')
        .send({ teamId: 'team-1', sprintId: 'sprint-1', jiraKey: 'WOSMVP-601' })

      expect(resolveDevQa).not.toHaveBeenCalled()
      expect(TeamMembership.find).not.toHaveBeenCalled()
      expect(SprintPlanEntry.create).toHaveBeenCalledWith({
        teamId: 'team-1',
        sprintId: 'sprint-1',
        ticketId: 't-601',
        order: 0,
      })
    })
  })

  describe('GET /api/sprint-plan-entries', () => {
    it('rejects missing teamId/sprintId', async () => {
      const app = createApp()
      const res = await request(app).get('/api/sprint-plan-entries').query({ teamId: 't1' })
      expect(res.status).toBe(400)
    })

    // A non-split entry now always calls `.toObject()` too (to attach
    // assigneeOverridePersonId, docs/adr/0005) - a real Mongoose document
    // always has this method; only these test doubles need it spelled out.
    function nonSplitDoc(overrides: Record<string, unknown> = {}) {
      const base = { _id: 'e1', order: 0, ticketId: { _id: 'tk-1', jiraKey: 'WOSMVP-1' }, ...overrides }
      return { ...base, toObject: () => base }
    }

    it('lists the plan with Ticket populated, sorted by order', async () => {
      const doc = nonSplitDoc()
      SprintPlanEntry.find.mockReturnValue(findWithPopulate([doc]))

      const app = createApp()
      const res = await request(app).get('/api/sprint-plan-entries').query({ teamId: 't1', sprintId: 's1' })

      expect(res.status).toBe(200)
      expect(SprintPlanEntry.find).toHaveBeenCalledWith({ teamId: 't1', sprintId: 's1' })
      expect(res.body).toEqual([{ ...doc.toObject(), assigneeOverridePersonId: null }])
    })

    it("inlines a Split entry's resolved dev/qa Role assignment as devQa, and a non-split entry's Assignee Override (or null) as assigneeOverridePersonId", async () => {
      const nonSplitEntry = nonSplitDoc()
      const splitEntry = {
        _id: 'e2',
        order: 0,
        devOrder: 1,
        qaOrder: 2,
        ticketId: { _id: 'tk-2', jiraKey: 'WOSMVP-2', type: 'Story' },
        toObject() {
          return {
            _id: 'e2',
            order: 0,
            devOrder: 1,
            qaOrder: 2,
            ticketId: { _id: 'tk-2', jiraKey: 'WOSMVP-2', type: 'Story' },
          }
        },
      }
      SprintPlanEntry.find.mockReturnValue(findWithPopulate([nonSplitEntry, splitEntry]))
      TeamMembership.find.mockReturnValue(withMembershipPopulate([{ personId: { _id: 'p1', jiraAccountId: 'acct-a' } }]))
      const devQa = { dev: { status: 'resolved', source: 'subtask', personId: 'p1' }, qa: { status: 'needs-assignment' } }
      resolveDevQa.mockResolvedValue(devQa)
      roleSubtaskEstimateHours.mockImplementation((_jiraKey: string, kind: string) => Promise.resolve(kind === 'Dev' ? 6 : 2))
      TicketAssigneeOverride.find.mockResolvedValue([{ ticketId: 'tk-1', personId: 'p9' }])

      const app = createApp()
      const res = await request(app).get('/api/sprint-plan-entries').query({ teamId: 't1', sprintId: 's1' })

      expect(res.status).toBe(200)
      expect(TicketAssigneeOverride.find).toHaveBeenCalledWith({ ticketId: { $in: ['tk-1'] } })
      expect(TeamMembership.find).toHaveBeenCalledWith({ teamId: 't1' })
      expect(resolveDevQa).toHaveBeenCalledWith(splitEntry.ticketId, [{ personId: 'p1', jiraAccountId: 'acct-a' }])
      expect(roleSubtaskEstimateHours).toHaveBeenCalledWith('WOSMVP-2', 'Dev')
      expect(roleSubtaskEstimateHours).toHaveBeenCalledWith('WOSMVP-2', 'Test')
      expect(res.body).toEqual([
        { ...nonSplitEntry.toObject(), assigneeOverridePersonId: 'p9' },
        {
          _id: 'e2',
          order: 0,
          devOrder: 1,
          qaOrder: 2,
          ticketId: { _id: 'tk-2', jiraKey: 'WOSMVP-2', type: 'Story' },
          devQa,
          devEstimateHours: 6,
          qaEstimateHours: 2,
        },
      ])
    })

    it('skips the TeamMembership lookup entirely when the plan has no Split entries at all', async () => {
      const doc = nonSplitDoc()
      SprintPlanEntry.find.mockReturnValue(findWithPopulate([doc]))

      const app = createApp()
      await request(app).get('/api/sprint-plan-entries').query({ teamId: 't1', sprintId: 's1' })

      expect(TeamMembership.find).not.toHaveBeenCalled()
      expect(resolveDevQa).not.toHaveBeenCalled()
    })

    it('skips the TicketAssigneeOverride lookup entirely when the plan has no non-split entries at all', async () => {
      const splitEntry = {
        _id: 'e2',
        order: 0,
        ticketId: { _id: 'tk-2', jiraKey: 'WOSMVP-2', type: 'Story' },
        toObject() {
          return this
        },
      }
      SprintPlanEntry.find.mockReturnValue(findWithPopulate([splitEntry]))
      TeamMembership.find.mockReturnValue(withMembershipPopulate([]))
      resolveDevQa.mockResolvedValue({ dev: { status: 'needs-assignment' }, qa: { status: 'needs-assignment' } })
      roleSubtaskEstimateHours.mockResolvedValue(0)

      const app = createApp()
      await request(app).get('/api/sprint-plan-entries').query({ teamId: 't1', sprintId: 's1' })

      expect(TicketAssigneeOverride.find).not.toHaveBeenCalled()
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

    it("resets a Split ticket's devOrder when its [Dev] Sub-task assignee changes, but leaves qaOrder untouched when qa is pinned by a TicketDevQaOverride (ADR 0004)", async () => {
      // Plan has one Split entry (parent WOSMVP-500, devOrder 2, qaOrder 1).
      // This sync discovers both its [Dev] and [Test] sub-task assignees
      // changed. dev isn't Overridden -> resolves to someone new -> devOrder
      // resets. qa *is* Overridden -> must never move, even though its
      // sub-task assignee also changed.
      SprintPlanEntry.find
        .mockReturnValueOnce(findWithPopulate([{ ticketId: { jiraKey: 'WOSMVP-500' } }])) // gather plan jiraKeys
        .mockReturnValueOnce(
          findWithPopulate([{ devOrder: 2, qaOrder: 1, ticketId: { _id: 'parent-500', type: 'Story' } }]),
        ) // nextOrderForRole('dev', ...), excludes parent-500 itself
        .mockReturnValueOnce(findWithPopulate([])) // final refresh

      bulkFetchIssues
        .mockResolvedValueOnce({
          issues: [issue('WOSMVP-500', { issuetype: { name: 'Story' }, subtasks: [{ key: 'WOSMVP-501' }, { key: 'WOSMVP-502' }] })],
          issueErrors: [],
        })
        .mockResolvedValueOnce({
          issues: [
            issue('WOSMVP-501', {
              issuetype: { name: 'Sub-task', subtask: true },
              summary: '[Dev]Do the thing',
              assignee: { accountId: 'acct-new-dev' },
            }),
            issue('WOSMVP-502', {
              issuetype: { name: 'Sub-task', subtask: true },
              summary: '[Test]Do the thing',
              assignee: { accountId: 'acct-new-qa' },
            }),
          ],
          issueErrors: [],
        })

      Ticket.findOne.mockImplementation(async (filter: { jiraKey: string }) => {
        if (filter.jiraKey === 'WOSMVP-500') return { _id: 'parent-500', jiraKey: 'WOSMVP-500', type: 'Story', assigneeAccountId: null }
        if (filter.jiraKey === 'WOSMVP-501') return { jiraKey: 'WOSMVP-501', assigneeAccountId: 'acct-old-dev' }
        return { jiraKey: 'WOSMVP-502', assigneeAccountId: 'acct-old-qa' }
      })
      Ticket.findOneAndUpdate.mockImplementation(async (filter: { jiraKey: string }) => {
        if (filter.jiraKey === 'WOSMVP-500') return { _id: 'parent-500', jiraKey: 'WOSMVP-500', type: 'Story', assigneeAccountId: null }
        if (filter.jiraKey === 'WOSMVP-501') {
          return { _id: 'sub-501', jiraKey: 'WOSMVP-501', parentKey: 'WOSMVP-500', subtaskKind: 'Dev', assigneeAccountId: 'acct-new-dev' }
        }
        return { _id: 'sub-502', jiraKey: 'WOSMVP-502', parentKey: 'WOSMVP-500', subtaskKind: 'Test', assigneeAccountId: 'acct-new-qa' }
      })

      TicketDevQaOverride.findOne.mockResolvedValue({ devPersonId: null, qaPersonId: 'person-existing-qa-override' })
      TeamMembership.find.mockReturnValue(withMembershipPopulate([]))
      resolveDevQa.mockResolvedValue({
        dev: { status: 'resolved', source: 'subtask', personId: 'person-new-dev' },
        qa: { status: 'resolved', source: 'subtask', personId: 'person-new-qa' },
      })

      const entry = { _id: 'entry-1', devOrder: 2, qaOrder: 1, save: vi.fn().mockResolvedValue(undefined) }
      SprintPlanEntry.findOne.mockImplementation(async (filter: { ticketId: string }) =>
        filter.ticketId === 'parent-500' ? entry : null,
      )

      const app = createApp()
      const res = await request(app).post('/api/sprint-plan-entries/sync').send({ teamId: 't1', sprintId: 's1' })

      expect(res.status).toBe(200)
      expect(TicketDevQaOverride.findOne).toHaveBeenCalledWith({ ticketId: 'parent-500' })
      expect(resolveDevQa).toHaveBeenCalledTimes(1) // only for the non-pinned (dev) role
      expect(entry.devOrder).toBe(0) // reset to the end of person-new-dev's (empty) row
      expect(entry.qaOrder).toBe(1) // untouched — pinned by the Override
      expect(entry.save).toHaveBeenCalledTimes(1)
    })

    it('does not touch devOrder/qaOrder, TeamMembership, or TicketDevQaOverride when no Sub-task assignee changed', async () => {
      SprintPlanEntry.find
        .mockReturnValueOnce(findWithPopulate([{ ticketId: { jiraKey: 'WOSMVP-700' } }]))
        .mockReturnValueOnce(findWithPopulate([]))

      bulkFetchIssues
        .mockResolvedValueOnce({
          issues: [issue('WOSMVP-700', { issuetype: { name: 'Story' }, subtasks: [{ key: 'WOSMVP-701' }] })],
          issueErrors: [],
        })
        .mockResolvedValueOnce({
          issues: [
            issue('WOSMVP-701', {
              issuetype: { name: 'Sub-task', subtask: true },
              summary: '[Dev]Do the thing',
              assignee: { accountId: 'acct-dev' },
            }),
          ],
          issueErrors: [],
        })

      Ticket.findOne.mockImplementation(async (filter: { jiraKey: string }) => {
        if (filter.jiraKey === 'WOSMVP-700') return { jiraKey: 'WOSMVP-700', type: 'Story', assigneeAccountId: null }
        return { jiraKey: 'WOSMVP-701', assigneeAccountId: 'acct-dev' } // unchanged
      })
      Ticket.findOneAndUpdate.mockImplementation(async (filter: { jiraKey: string }) => {
        if (filter.jiraKey === 'WOSMVP-700') return { _id: 'parent-700', jiraKey: 'WOSMVP-700', type: 'Story', assigneeAccountId: null }
        return { _id: 'sub-701', jiraKey: 'WOSMVP-701', parentKey: 'WOSMVP-700', subtaskKind: 'Dev', assigneeAccountId: 'acct-dev' }
      })

      const app = createApp()
      const res = await request(app).post('/api/sprint-plan-entries/sync').send({ teamId: 't1', sprintId: 's1' })

      expect(res.status).toBe(200)
      expect(TeamMembership.find).not.toHaveBeenCalled()
      expect(TicketDevQaOverride.findOne).not.toHaveBeenCalled()
      expect(SprintPlanEntry.findOne).not.toHaveBeenCalled()
    })
  })

  describe('PATCH /api/sprint-plan-entries/:id', () => {
    it('updates order', async () => {
      const populate = vi.fn().mockResolvedValue({ _id: 'e1', order: 4 })
      SprintPlanEntry.findByIdAndUpdate.mockReturnValue({ populate })

      const app = createApp()
      const res = await request(app).patch('/api/sprint-plan-entries/e1').send({ order: 4 })

      expect(res.status).toBe(200)
      expect(SprintPlanEntry.findByIdAndUpdate).toHaveBeenCalledWith('e1', { order: 4 }, { returnDocument: 'after' })
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

    it('updates devOrder only, leaving order/qaOrder untouched (Split ticket dev-row drag)', async () => {
      const populate = vi.fn().mockResolvedValue({ _id: 'e1', devOrder: 2 })
      SprintPlanEntry.findByIdAndUpdate.mockReturnValue({ populate })

      const app = createApp()
      const res = await request(app).patch('/api/sprint-plan-entries/e1').send({ devOrder: 2 })

      expect(res.status).toBe(200)
      expect(SprintPlanEntry.findByIdAndUpdate).toHaveBeenCalledWith('e1', { devOrder: 2 }, { returnDocument: 'after' })
    })

    it('updates qaOrder only, leaving order/devOrder untouched (Split ticket qa-row drag)', async () => {
      const populate = vi.fn().mockResolvedValue({ _id: 'e1', qaOrder: 3 })
      SprintPlanEntry.findByIdAndUpdate.mockReturnValue({ populate })

      const app = createApp()
      const res = await request(app).patch('/api/sprint-plan-entries/e1').send({ qaOrder: 3 })

      expect(res.status).toBe(200)
      expect(SprintPlanEntry.findByIdAndUpdate).toHaveBeenCalledWith('e1', { qaOrder: 3 }, { returnDocument: 'after' })
    })

    it('rejects a non-numeric devOrder/qaOrder', async () => {
      const app = createApp()
      const res1 = await request(app).patch('/api/sprint-plan-entries/e1').send({ devOrder: 'x' })
      expect(res1.status).toBe(400)
      const res2 = await request(app).patch('/api/sprint-plan-entries/e1').send({ qaOrder: 'x' })
      expect(res2.status).toBe(400)
      expect(SprintPlanEntry.findByIdAndUpdate).not.toHaveBeenCalled()
    })

    it('rejects a body with none of order/devOrder/qaOrder present', async () => {
      const app = createApp()
      const res = await request(app).patch('/api/sprint-plan-entries/e1').send({})
      expect(res.status).toBe(400)
      expect(SprintPlanEntry.findByIdAndUpdate).not.toHaveBeenCalled()
    })
  })
})
