import request from 'supertest'
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'

interface MockedAtlasPlanningHolidayModel {
  find: Mock
  create: Mock
  findByIdAndDelete: Mock
}

vi.mock('../src/models/AtlasPlanningHoliday.ts', () => ({
  AtlasPlanningHoliday: {
    find: vi.fn(),
    create: vi.fn(),
    findByIdAndDelete: vi.fn(),
  },
}))

// Pins "today" for every test so GET's window-filter assertions are
// deterministic rather than depending on the real wall clock.
vi.mock('../src/utils/rollingWindow.ts', () => ({
  computeRollingWindowDates: vi.fn(() => ['2026-08-22', '2026-08-23', '2026-08-24']),
}))

const { AtlasPlanningHoliday } = (await import('../src/models/AtlasPlanningHoliday.ts')) as unknown as {
  AtlasPlanningHoliday: MockedAtlasPlanningHolidayModel
}
const { createApp } = await import('../src/app.ts')

describe('POST /api/atlas-planning-holidays', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('rejects a missing date', async () => {
    const app = createApp()
    const res = await request(app).post('/api/atlas-planning-holidays').send({})

    expect(res.status).toBe(400)
    expect(res.body.error).toBeTruthy()
    expect(AtlasPlanningHoliday.create).not.toHaveBeenCalled()
  })

  it('rejects a malformed date', async () => {
    const app = createApp()
    const res = await request(app).post('/api/atlas-planning-holidays').send({ date: 'not-a-date' })

    expect(res.status).toBe(400)
    expect(AtlasPlanningHoliday.create).not.toHaveBeenCalled()
  })

  it('creates and returns the new holiday', async () => {
    AtlasPlanningHoliday.create.mockResolvedValue({ _id: 'h1', date: '2026-08-22' })

    const app = createApp()
    const res = await request(app).post('/api/atlas-planning-holidays').send({ date: '2026-08-22' })

    expect(AtlasPlanningHoliday.create).toHaveBeenCalledWith({ date: '2026-08-22' })
    expect(res.status).toBe(201)
    expect(res.body.date).toBe('2026-08-22')
  })

  it('returns 409 on a duplicate date, via the real unique index', async () => {
    const duplicateError = Object.assign(new Error('E11000'), { code: 11000 })
    AtlasPlanningHoliday.create.mockRejectedValue(duplicateError)

    const app = createApp()
    const res = await request(app).post('/api/atlas-planning-holidays').send({ date: '2026-08-22' })

    expect(res.status).toBe(409)
    expect(res.body.error).toBeTruthy()
  })

  it('passes an unexpected error to the error handler (500)', async () => {
    AtlasPlanningHoliday.create.mockRejectedValue(new Error('boom'))

    const app = createApp()
    const res = await request(app).post('/api/atlas-planning-holidays').send({ date: '2026-08-22' })

    expect(res.status).toBe(500)
  })
})

describe('GET /api/atlas-planning-holidays', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('filters to the current rolling window via $in on the mocked window dates', async () => {
    AtlasPlanningHoliday.find.mockReturnValue({
      sort: vi.fn().mockResolvedValue([{ _id: 'h1', date: '2026-08-22' }]),
    })

    const app = createApp()
    const res = await request(app).get('/api/atlas-planning-holidays')

    expect(res.status).toBe(200)
    expect(AtlasPlanningHoliday.find).toHaveBeenCalledWith({
      date: { $in: ['2026-08-22', '2026-08-23', '2026-08-24'] },
    })
    expect(res.body).toHaveLength(1)
  })
})

describe('DELETE /api/atlas-planning-holidays/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('deletes the holiday and returns 204', async () => {
    AtlasPlanningHoliday.findByIdAndDelete.mockResolvedValue({ _id: 'h1' })

    const app = createApp()
    const res = await request(app).delete('/api/atlas-planning-holidays/h1')

    expect(res.status).toBe(204)
    expect(AtlasPlanningHoliday.findByIdAndDelete).toHaveBeenCalledWith('h1')
  })

  it('returns 404 when the holiday does not exist', async () => {
    AtlasPlanningHoliday.findByIdAndDelete.mockResolvedValue(null)

    const app = createApp()
    const res = await request(app).delete('/api/atlas-planning-holidays/missing')

    expect(res.status).toBe(404)
  })

  it('passes an unexpected error to the error handler (500)', async () => {
    AtlasPlanningHoliday.findByIdAndDelete.mockRejectedValue(new Error('boom'))

    const app = createApp()
    const res = await request(app).delete('/api/atlas-planning-holidays/h1')

    expect(res.status).toBe(500)
  })
})
