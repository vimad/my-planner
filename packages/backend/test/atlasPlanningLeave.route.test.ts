import request from 'supertest'
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'

interface MockedAtlasPlanningLeaveModel {
  find: Mock
  create: Mock
  findByIdAndUpdate: Mock
  findByIdAndDelete: Mock
}

vi.mock('../src/models/AtlasPlanningLeave.ts', () => ({
  AtlasPlanningLeave: {
    find: vi.fn(),
    create: vi.fn(),
    findByIdAndUpdate: vi.fn(),
    findByIdAndDelete: vi.fn(),
  },
}))

// Pins "today" for every test so GET's window-filter assertions are
// deterministic rather than depending on the real wall clock.
vi.mock('../src/utils/rollingWindow.ts', () => ({
  computeRollingWindowDates: vi.fn(() => ['2026-08-22', '2026-08-23', '2026-08-24']),
}))

const { AtlasPlanningLeave } = (await import('../src/models/AtlasPlanningLeave.ts')) as unknown as {
  AtlasPlanningLeave: MockedAtlasPlanningLeaveModel
}
const { createApp } = await import('../src/app.ts')

describe('POST /api/atlas-planning-leave', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('rejects a missing rosterMemberId', async () => {
    const app = createApp()
    const res = await request(app).post('/api/atlas-planning-leave').send({ date: '2026-08-22', portion: 'full' })

    expect(res.status).toBe(400)
    expect(res.body.error).toBeTruthy()
    expect(AtlasPlanningLeave.create).not.toHaveBeenCalled()
  })

  it('rejects a missing date', async () => {
    const app = createApp()
    const res = await request(app).post('/api/atlas-planning-leave').send({ rosterMemberId: 'm1', portion: 'full' })

    expect(res.status).toBe(400)
    expect(AtlasPlanningLeave.create).not.toHaveBeenCalled()
  })

  it('rejects a malformed date', async () => {
    const app = createApp()
    const res = await request(app)
      .post('/api/atlas-planning-leave')
      .send({ rosterMemberId: 'm1', date: '08/22/2026', portion: 'full' })

    expect(res.status).toBe(400)
    expect(AtlasPlanningLeave.create).not.toHaveBeenCalled()
  })

  it('rejects an invalid portion', async () => {
    const app = createApp()
    const res = await request(app)
      .post('/api/atlas-planning-leave')
      .send({ rosterMemberId: 'm1', date: '2026-08-22', portion: 'quarter' })

    expect(res.status).toBe(400)
    expect(AtlasPlanningLeave.create).not.toHaveBeenCalled()
  })

  it('creates and returns the new leave mark', async () => {
    AtlasPlanningLeave.create.mockResolvedValue({ _id: 'l1', rosterMemberId: 'm1', date: '2026-08-22', portion: 'full' })

    const app = createApp()
    const res = await request(app)
      .post('/api/atlas-planning-leave')
      .send({ rosterMemberId: 'm1', date: '2026-08-22', portion: 'full' })

    expect(AtlasPlanningLeave.create).toHaveBeenCalledWith({ rosterMemberId: 'm1', date: '2026-08-22', portion: 'full' })
    expect(res.status).toBe(201)
    expect(res.body.portion).toBe('full')
  })

  it('returns 409 on a duplicate (rosterMemberId, date) mark, via the real unique index', async () => {
    const duplicateError = Object.assign(new Error('E11000'), { code: 11000 })
    AtlasPlanningLeave.create.mockRejectedValue(duplicateError)

    const app = createApp()
    const res = await request(app)
      .post('/api/atlas-planning-leave')
      .send({ rosterMemberId: 'm1', date: '2026-08-22', portion: 'full' })

    expect(res.status).toBe(409)
    expect(res.body.error).toBeTruthy()
  })

  it('passes an unexpected error to the error handler (500)', async () => {
    AtlasPlanningLeave.create.mockRejectedValue(new Error('boom'))

    const app = createApp()
    const res = await request(app)
      .post('/api/atlas-planning-leave')
      .send({ rosterMemberId: 'm1', date: '2026-08-22', portion: 'full' })

    expect(res.status).toBe(500)
  })
})

describe('GET /api/atlas-planning-leave', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('filters to the current rolling window via $in on the mocked window dates', async () => {
    AtlasPlanningLeave.find.mockReturnValue({
      sort: vi.fn().mockResolvedValue([{ _id: 'l1', rosterMemberId: 'm1', date: '2026-08-22', portion: 'full' }]),
    })

    const app = createApp()
    const res = await request(app).get('/api/atlas-planning-leave')

    expect(res.status).toBe(200)
    expect(AtlasPlanningLeave.find).toHaveBeenCalledWith({
      date: { $in: ['2026-08-22', '2026-08-23', '2026-08-24'] },
    })
    expect(res.body).toHaveLength(1)
  })
})

describe('PATCH /api/atlas-planning-leave/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('changes the portion and returns the updated mark', async () => {
    AtlasPlanningLeave.findByIdAndUpdate.mockResolvedValue({ _id: 'l1', rosterMemberId: 'm1', date: '2026-08-22', portion: 'half' })

    const app = createApp()
    const res = await request(app).patch('/api/atlas-planning-leave/l1').send({ portion: 'half' })

    expect(res.status).toBe(200)
    expect(res.body.portion).toBe('half')
    const [id, update] = AtlasPlanningLeave.findByIdAndUpdate.mock.calls[0]
    expect(id).toBe('l1')
    expect(update).toEqual({ portion: 'half' })
  })

  it('rejects an invalid portion', async () => {
    const app = createApp()
    const res = await request(app).patch('/api/atlas-planning-leave/l1').send({ portion: 'nope' })

    expect(res.status).toBe(400)
    expect(AtlasPlanningLeave.findByIdAndUpdate).not.toHaveBeenCalled()
  })

  it('returns 404 when the mark does not exist', async () => {
    AtlasPlanningLeave.findByIdAndUpdate.mockResolvedValue(null)

    const app = createApp()
    const res = await request(app).patch('/api/atlas-planning-leave/missing').send({ portion: 'half' })

    expect(res.status).toBe(404)
  })

  it('passes an unexpected error to the error handler (500)', async () => {
    AtlasPlanningLeave.findByIdAndUpdate.mockRejectedValue(new Error('boom'))

    const app = createApp()
    const res = await request(app).patch('/api/atlas-planning-leave/l1').send({ portion: 'half' })

    expect(res.status).toBe(500)
  })
})

describe('DELETE /api/atlas-planning-leave/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('deletes the mark and returns 204', async () => {
    AtlasPlanningLeave.findByIdAndDelete.mockResolvedValue({ _id: 'l1' })

    const app = createApp()
    const res = await request(app).delete('/api/atlas-planning-leave/l1')

    expect(res.status).toBe(204)
    expect(AtlasPlanningLeave.findByIdAndDelete).toHaveBeenCalledWith('l1')
  })

  it('returns 404 when the mark does not exist', async () => {
    AtlasPlanningLeave.findByIdAndDelete.mockResolvedValue(null)

    const app = createApp()
    const res = await request(app).delete('/api/atlas-planning-leave/missing')

    expect(res.status).toBe(404)
  })

  it('passes an unexpected error to the error handler (500)', async () => {
    AtlasPlanningLeave.findByIdAndDelete.mockRejectedValue(new Error('boom'))

    const app = createApp()
    const res = await request(app).delete('/api/atlas-planning-leave/l1')

    expect(res.status).toBe(500)
  })
})
