import request from 'supertest'
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'

interface MockedTicketDevQaOverrideModel {
  findOneAndUpdate: Mock
}
interface MockedTeamModel {
  findById: Mock
}
interface MockedSprintModel {
  findById: Mock
}
interface MockedTicketModel {
  find: Mock
}

vi.mock('../src/models/TicketDevQaOverride.ts', () => ({
  TicketDevQaOverride: { findOneAndUpdate: vi.fn() },
}))
vi.mock('../src/models/Team.ts', () => ({ Team: { findById: vi.fn() } }))
vi.mock('../src/models/Sprint.ts', () => ({ Sprint: { findById: vi.fn() } }))
vi.mock('../src/models/Ticket.ts', () => ({ Ticket: { find: vi.fn() } }))

const { TicketDevQaOverride } = (await import('../src/models/TicketDevQaOverride.ts')) as unknown as {
  TicketDevQaOverride: MockedTicketDevQaOverrideModel
}
const { Team } = (await import('../src/models/Team.ts')) as unknown as { Team: MockedTeamModel }
const { Sprint } = (await import('../src/models/Sprint.ts')) as unknown as { Sprint: MockedSprintModel }
const { Ticket } = (await import('../src/models/Ticket.ts')) as unknown as { Ticket: MockedTicketModel }
const { createApp } = await import('../src/app.ts')

describe('GET /api/tickets', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('rejects a missing teamId/sprintId', async () => {
    const app = createApp()
    const res = await request(app).get('/api/tickets').query({ teamId: 't1' })
    expect(res.status).toBe(400)
  })

  it('returns 404 when the team does not exist', async () => {
    Team.findById.mockResolvedValue(null)
    const app = createApp()
    const res = await request(app).get('/api/tickets').query({ teamId: 't1', sprintId: 's1' })
    expect(res.status).toBe(404)
  })

  it('returns 404 when the sprint does not exist', async () => {
    Team.findById.mockResolvedValue({ jiraLabels: ['Odyssey'] })
    Sprint.findById.mockResolvedValue(null)
    const app = createApp()
    const res = await request(app).get('/api/tickets').query({ teamId: 't1', sprintId: 's1' })
    expect(res.status).toBe(404)
  })

  it("returns cached tickets scoped to the sprint's jiraSprintId and the team's jiraLabels", async () => {
    Team.findById.mockResolvedValue({ jiraLabels: ['Odyssey'] })
    Sprint.findById.mockResolvedValue({ jiraSprintId: '632' })
    const tickets = [{ jiraKey: 'WOSMVP-100', status: 'To Do' }]
    Ticket.find.mockResolvedValue(tickets)

    const app = createApp()
    const res = await request(app).get('/api/tickets').query({ teamId: 't1', sprintId: 's1' })

    expect(res.status).toBe(200)
    expect(res.body).toEqual(tickets)
    expect(Ticket.find).toHaveBeenCalledWith({ currentSprintKey: '632', labels: { $in: ['Odyssey'] } })
  })
})

describe('PUT /api/tickets/:ticketId/dev-qa-override', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('upserts devPersonId only, leaving qaPersonId untouched when omitted', async () => {
    TicketDevQaOverride.findOneAndUpdate.mockResolvedValue({
      ticketId: 'ticket-1',
      devPersonId: 'person-ada',
      qaPersonId: null,
    })

    const app = createApp()
    const res = await request(app).put('/api/tickets/ticket-1/dev-qa-override').send({ devPersonId: 'person-ada' })

    expect(res.status).toBe(200)
    expect(TicketDevQaOverride.findOneAndUpdate).toHaveBeenCalledWith(
      { ticketId: 'ticket-1' },
      { $set: { devPersonId: 'person-ada' }, $setOnInsert: { ticketId: 'ticket-1' } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    )
  })

  it('upserts both devPersonId and qaPersonId when both are present', async () => {
    TicketDevQaOverride.findOneAndUpdate.mockResolvedValue({
      ticketId: 'ticket-1',
      devPersonId: 'person-ada',
      qaPersonId: 'person-bob',
    })

    const app = createApp()
    const res = await request(app)
      .put('/api/tickets/ticket-1/dev-qa-override')
      .send({ devPersonId: 'person-ada', qaPersonId: 'person-bob' })

    expect(res.status).toBe(200)
    expect(TicketDevQaOverride.findOneAndUpdate).toHaveBeenCalledWith(
      { ticketId: 'ticket-1' },
      { $set: { devPersonId: 'person-ada', qaPersonId: 'person-bob' }, $setOnInsert: { ticketId: 'ticket-1' } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    )
  })

  it('an explicit null for a role clears that role back to normal resolution', async () => {
    TicketDevQaOverride.findOneAndUpdate.mockResolvedValue({
      ticketId: 'ticket-1',
      devPersonId: null,
      qaPersonId: 'person-bob',
    })

    const app = createApp()
    const res = await request(app).put('/api/tickets/ticket-1/dev-qa-override').send({ devPersonId: null })

    expect(res.status).toBe(200)
    expect(TicketDevQaOverride.findOneAndUpdate).toHaveBeenCalledWith(
      { ticketId: 'ticket-1' },
      { $set: { devPersonId: null }, $setOnInsert: { ticketId: 'ticket-1' } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    )
  })

  it('an empty body updates neither role (no-op upsert, e.g. just to ensure the doc exists)', async () => {
    TicketDevQaOverride.findOneAndUpdate.mockResolvedValue({
      ticketId: 'ticket-1',
      devPersonId: null,
      qaPersonId: null,
    })

    const app = createApp()
    const res = await request(app).put('/api/tickets/ticket-1/dev-qa-override').send({})

    expect(res.status).toBe(200)
    expect(TicketDevQaOverride.findOneAndUpdate).toHaveBeenCalledWith(
      { ticketId: 'ticket-1' },
      { $set: {}, $setOnInsert: { ticketId: 'ticket-1' } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    )
  })
})
