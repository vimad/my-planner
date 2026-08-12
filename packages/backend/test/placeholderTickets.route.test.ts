import request from 'supertest'
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'

interface MockedPlaceholderTicketModel {
  find: Mock
  create: Mock
  findByIdAndDelete: Mock
}

vi.mock('../src/models/PlaceholderTicket.ts', () => ({
  PlaceholderTicket: { find: vi.fn(), create: vi.fn(), findByIdAndDelete: vi.fn() },
}))

const { PlaceholderTicket } = (await import('../src/models/PlaceholderTicket.ts')) as unknown as {
  PlaceholderTicket: MockedPlaceholderTicketModel
}
const { createApp } = await import('../src/app.ts')

function withSort(result: unknown) {
  return { sort: vi.fn().mockResolvedValue(result) }
}

describe('GET /api/placeholder-tickets', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('400s when teamId or sprintId is missing', async () => {
    const app = createApp()
    const res = await request(app).get('/api/placeholder-tickets?teamId=t1')

    expect(res.status).toBe(400)
    expect(PlaceholderTicket.find).not.toHaveBeenCalled()
  })

  it('lists placeholder tickets for a team+sprint, oldest first', async () => {
    PlaceholderTicket.find.mockReturnValue(withSort([{ _id: 'ph1', text: 'On-call', estimateHours: 4 }]))

    const app = createApp()
    const res = await request(app).get('/api/placeholder-tickets?teamId=t1&sprintId=s1')

    expect(res.status).toBe(200)
    expect(PlaceholderTicket.find).toHaveBeenCalledWith({ teamId: 't1', sprintId: 's1' })
    expect(res.body).toEqual([{ _id: 'ph1', text: 'On-call', estimateHours: 4 }])
  })
})

describe('POST /api/placeholder-tickets', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('400s when teamId, sprintId or personId is missing', async () => {
    const app = createApp()
    const res = await request(app)
      .post('/api/placeholder-tickets')
      .send({ teamId: 't1', sprintId: 's1', text: 'On-call', estimateHours: 4 })

    expect(res.status).toBe(400)
    expect(PlaceholderTicket.create).not.toHaveBeenCalled()
  })

  it('400s when text is blank/whitespace-only', async () => {
    const app = createApp()
    const res = await request(app)
      .post('/api/placeholder-tickets')
      .send({ teamId: 't1', sprintId: 's1', personId: 'p1', text: '   ', estimateHours: 4 })

    expect(res.status).toBe(400)
    expect(PlaceholderTicket.create).not.toHaveBeenCalled()
  })

  it('400s when estimateHours is missing or negative', async () => {
    const app = createApp()
    const res = await request(app)
      .post('/api/placeholder-tickets')
      .send({ teamId: 't1', sprintId: 's1', personId: 'p1', text: 'On-call', estimateHours: -1 })

    expect(res.status).toBe(400)
    expect(PlaceholderTicket.create).not.toHaveBeenCalled()
  })

  it('creates a placeholder ticket with trimmed text', async () => {
    PlaceholderTicket.create.mockResolvedValue({
      _id: 'ph1',
      teamId: 't1',
      sprintId: 's1',
      personId: 'p1',
      text: 'On-call',
      estimateHours: 4,
    })

    const app = createApp()
    const res = await request(app)
      .post('/api/placeholder-tickets')
      .send({ teamId: 't1', sprintId: 's1', personId: 'p1', text: '  On-call  ', estimateHours: 4 })

    expect(res.status).toBe(201)
    expect(PlaceholderTicket.create).toHaveBeenCalledWith({
      teamId: 't1',
      sprintId: 's1',
      personId: 'p1',
      text: 'On-call',
      estimateHours: 4,
    })
    expect(res.body).toMatchObject({ _id: 'ph1', text: 'On-call', estimateHours: 4 })
  })
})

describe('DELETE /api/placeholder-tickets/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('404s when the placeholder ticket does not exist', async () => {
    PlaceholderTicket.findByIdAndDelete.mockResolvedValue(null)

    const app = createApp()
    const res = await request(app).delete('/api/placeholder-tickets/ph1')

    expect(res.status).toBe(404)
  })

  it('deletes an existing placeholder ticket', async () => {
    PlaceholderTicket.findByIdAndDelete.mockResolvedValue({ _id: 'ph1' })

    const app = createApp()
    const res = await request(app).delete('/api/placeholder-tickets/ph1')

    expect(res.status).toBe(204)
    expect(PlaceholderTicket.findByIdAndDelete).toHaveBeenCalledWith('ph1')
  })
})
