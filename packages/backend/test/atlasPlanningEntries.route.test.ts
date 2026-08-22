import request from 'supertest'
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'

interface MockedAtlasPlanningEntryModel {
  find: Mock
  findByIdAndUpdate: Mock
}

vi.mock('../src/models/AtlasPlanningEntry.ts', () => ({
  AtlasPlanningEntry: {
    find: vi.fn(),
    findByIdAndUpdate: vi.fn(),
  },
}))
vi.mock('../src/services/atlasPlanningSync.ts', () => ({
  reconcilePlanningEntries: vi.fn(),
}))

const { AtlasPlanningEntry } = (await import('../src/models/AtlasPlanningEntry.ts')) as unknown as {
  AtlasPlanningEntry: MockedAtlasPlanningEntryModel
}
const { reconcilePlanningEntries } = (await import('../src/services/atlasPlanningSync.ts')) as unknown as {
  reconcilePlanningEntries: Mock
}
const { createApp } = await import('../src/app.ts')

describe('GET /api/atlas-planning-entries', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns every entry sorted by rosterMemberId then order', async () => {
    const sort = vi.fn().mockResolvedValue([
      { _id: 'pe1', rosterMemberId: 'm1', taskId: 't1', jiraKey: 'WOSMVP-100', order: 0, startDate: null, endDate: null },
      { _id: 'pe2', rosterMemberId: 'm2', taskId: 't2', jiraKey: 'WOSMVP-200', order: 0, startDate: null, endDate: null },
    ])
    AtlasPlanningEntry.find.mockReturnValue({ sort })

    const app = createApp()
    const res = await request(app).get('/api/atlas-planning-entries')

    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(2)
    expect(sort).toHaveBeenCalledWith({ rosterMemberId: 1, order: 1 })
  })
})

describe('POST /api/atlas-planning-entries/sync', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('runs the reconciliation pass and returns the refreshed, sorted list', async () => {
    const sort = vi.fn().mockResolvedValue([
      { _id: 'pe1', rosterMemberId: 'm1', taskId: 't1', jiraKey: 'WOSMVP-100', order: 0, startDate: null, endDate: null },
    ])
    AtlasPlanningEntry.find.mockReturnValue({ sort })
    reconcilePlanningEntries.mockResolvedValue(undefined)

    const app = createApp()
    const res = await request(app).post('/api/atlas-planning-entries/sync')

    expect(reconcilePlanningEntries).toHaveBeenCalledTimes(1)
    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(1)
  })

  it('passes an unexpected error to the error handler (500)', async () => {
    reconcilePlanningEntries.mockRejectedValue(new Error('boom'))

    const app = createApp()
    const res = await request(app).post('/api/atlas-planning-entries/sync')

    expect(res.status).toBe(500)
  })
})

describe('PATCH /api/atlas-planning-entries/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('updates startDate/endDate and returns the updated entry', async () => {
    AtlasPlanningEntry.findByIdAndUpdate.mockResolvedValue({
      _id: 'pe1',
      rosterMemberId: 'm1',
      taskId: 't1',
      jiraKey: 'WOSMVP-100',
      order: 0,
      startDate: '2026-08-12',
      endDate: '2026-08-14',
    })

    const app = createApp()
    const res = await request(app)
      .patch('/api/atlas-planning-entries/pe1')
      .send({ startDate: '2026-08-12', endDate: '2026-08-14' })

    expect(res.status).toBe(200)
    expect(res.body.startDate).toBe('2026-08-12')
    expect(res.body.endDate).toBe('2026-08-14')
    const [id, update] = AtlasPlanningEntry.findByIdAndUpdate.mock.calls[0]
    expect(id).toBe('pe1')
    expect(update).toEqual({ startDate: '2026-08-12', endDate: '2026-08-14' })
  })

  it('allows clearing startDate/endDate back to null', async () => {
    AtlasPlanningEntry.findByIdAndUpdate.mockResolvedValue({
      _id: 'pe1',
      rosterMemberId: 'm1',
      taskId: 't1',
      jiraKey: 'WOSMVP-100',
      order: 0,
      startDate: null,
      endDate: null,
    })

    const app = createApp()
    const res = await request(app).patch('/api/atlas-planning-entries/pe1').send({ startDate: null, endDate: null })

    expect(res.status).toBe(200)
    const [, update] = AtlasPlanningEntry.findByIdAndUpdate.mock.calls[0]
    expect(update).toEqual({ startDate: null, endDate: null })
  })

  it('rejects a malformed startDate', async () => {
    const app = createApp()
    const res = await request(app).patch('/api/atlas-planning-entries/pe1').send({ startDate: 'not-a-date' })

    expect(res.status).toBe(400)
    expect(AtlasPlanningEntry.findByIdAndUpdate).not.toHaveBeenCalled()
  })

  it('rejects a malformed endDate', async () => {
    const app = createApp()
    const res = await request(app).patch('/api/atlas-planning-entries/pe1').send({ endDate: '08/14/2026' })

    expect(res.status).toBe(400)
    expect(AtlasPlanningEntry.findByIdAndUpdate).not.toHaveBeenCalled()
  })

  it('returns 404 when the entry does not exist', async () => {
    AtlasPlanningEntry.findByIdAndUpdate.mockResolvedValue(null)

    const app = createApp()
    const res = await request(app).patch('/api/atlas-planning-entries/missing').send({ startDate: '2026-08-12' })

    expect(res.status).toBe(404)
  })

  it('passes an unexpected error to the error handler (500)', async () => {
    AtlasPlanningEntry.findByIdAndUpdate.mockRejectedValue(new Error('boom'))

    const app = createApp()
    const res = await request(app).patch('/api/atlas-planning-entries/pe1').send({ startDate: '2026-08-12' })

    expect(res.status).toBe(500)
  })
})
