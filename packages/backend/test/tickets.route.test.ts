import request from 'supertest'
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'

interface MockedTicketDevQaOverrideModel {
  findOneAndUpdate: Mock
}

vi.mock('../src/models/TicketDevQaOverride.ts', () => ({
  TicketDevQaOverride: { findOneAndUpdate: vi.fn() },
}))

const { TicketDevQaOverride } = (await import('../src/models/TicketDevQaOverride.ts')) as unknown as {
  TicketDevQaOverride: MockedTicketDevQaOverrideModel
}
const { createApp } = await import('../src/app.ts')

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
