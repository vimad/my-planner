import request from 'supertest'
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'

interface MockedAtlasPlanningEntryModel {
  find: Mock
  create: Mock
  findByIdAndUpdate: Mock
  findByIdAndDelete: Mock
}

vi.mock('../src/models/AtlasPlanningEntry.ts', () => ({
  AtlasPlanningEntry: {
    find: vi.fn(),
    create: vi.fn(),
    findByIdAndUpdate: vi.fn(),
    findByIdAndDelete: vi.fn(),
  },
}))

const { AtlasPlanningEntry } = (await import('../src/models/AtlasPlanningEntry.ts')) as unknown as {
  AtlasPlanningEntry: MockedAtlasPlanningEntryModel
}
const { createApp } = await import('../src/app.ts')

describe('POST /api/atlas-planning-entries', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('rejects a missing rosterMemberId', async () => {
    const app = createApp()
    const res = await request(app).post('/api/atlas-planning-entries').send({ jiraKey: 'WOSMVP-100' })

    expect(res.status).toBe(400)
    expect(res.body.error).toBeTruthy()
    expect(AtlasPlanningEntry.create).not.toHaveBeenCalled()
  })

  it('rejects a missing jiraKey', async () => {
    const app = createApp()
    const res = await request(app).post('/api/atlas-planning-entries').send({ rosterMemberId: 'm1' })

    expect(res.status).toBe(400)
    expect(res.body.error).toBeTruthy()
    expect(AtlasPlanningEntry.create).not.toHaveBeenCalled()
  })

  it('creates and returns the new entry, storing only the raw jiraKey - no Jira lookup', async () => {
    AtlasPlanningEntry.create.mockResolvedValue({
      _id: 'pe1',
      rosterMemberId: 'm1',
      jiraKey: 'WOSMVP-100',
      startDate: null,
      endDate: null,
    })

    const app = createApp()
    const res = await request(app).post('/api/atlas-planning-entries').send({ rosterMemberId: 'm1', jiraKey: 'WOSMVP-100' })

    expect(AtlasPlanningEntry.create).toHaveBeenCalledWith({ rosterMemberId: 'm1', jiraKey: 'WOSMVP-100' })
    expect(res.status).toBe(201)
    expect(res.body.jiraKey).toBe('WOSMVP-100')
    expect(res.body.rosterMemberId).toBe('m1')
  })

  it('passes an unexpected error to the error handler (500)', async () => {
    AtlasPlanningEntry.create.mockRejectedValue(new Error('boom'))

    const app = createApp()
    const res = await request(app).post('/api/atlas-planning-entries').send({ rosterMemberId: 'm1', jiraKey: 'WOSMVP-100' })

    expect(res.status).toBe(500)
  })
})

describe('GET /api/atlas-planning-entries', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns every attached ticket in creation order', async () => {
    AtlasPlanningEntry.find.mockReturnValue({
      sort: vi.fn().mockResolvedValue([
        { _id: 'pe1', rosterMemberId: 'm1', jiraKey: 'WOSMVP-100', startDate: null, endDate: null },
        { _id: 'pe2', rosterMemberId: 'm2', jiraKey: 'WOSMVP-200', startDate: null, endDate: null },
      ]),
    })

    const app = createApp()
    const res = await request(app).get('/api/atlas-planning-entries')

    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(2)
    expect(res.body[0].jiraKey).toBe('WOSMVP-100')
  })
})

describe('PATCH /api/atlas-planning-entries/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('reassigns rosterMemberId and returns the updated entry', async () => {
    AtlasPlanningEntry.findByIdAndUpdate.mockResolvedValue({ _id: 'pe1', rosterMemberId: 'm2', jiraKey: 'WOSMVP-100' })

    const app = createApp()
    const res = await request(app).patch('/api/atlas-planning-entries/pe1').send({ rosterMemberId: 'm2' })

    expect(res.status).toBe(200)
    expect(res.body.rosterMemberId).toBe('m2')
    const [id, update] = AtlasPlanningEntry.findByIdAndUpdate.mock.calls[0]
    expect(id).toBe('pe1')
    expect(update).toEqual({ rosterMemberId: 'm2' })
  })

  it('rejects an empty rosterMemberId', async () => {
    const app = createApp()
    const res = await request(app).patch('/api/atlas-planning-entries/pe1').send({ rosterMemberId: '' })

    expect(res.status).toBe(400)
    expect(AtlasPlanningEntry.findByIdAndUpdate).not.toHaveBeenCalled()
  })

  it('returns 404 when the entry does not exist', async () => {
    AtlasPlanningEntry.findByIdAndUpdate.mockResolvedValue(null)

    const app = createApp()
    const res = await request(app).patch('/api/atlas-planning-entries/missing').send({ rosterMemberId: 'm2' })

    expect(res.status).toBe(404)
  })

  it('passes an unexpected error to the error handler (500)', async () => {
    AtlasPlanningEntry.findByIdAndUpdate.mockRejectedValue(new Error('boom'))

    const app = createApp()
    const res = await request(app).patch('/api/atlas-planning-entries/pe1').send({ rosterMemberId: 'm2' })

    expect(res.status).toBe(500)
  })
})

describe('DELETE /api/atlas-planning-entries/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('deletes the entry and returns 204', async () => {
    AtlasPlanningEntry.findByIdAndDelete.mockResolvedValue({ _id: 'pe1' })

    const app = createApp()
    const res = await request(app).delete('/api/atlas-planning-entries/pe1')

    expect(res.status).toBe(204)
    expect(AtlasPlanningEntry.findByIdAndDelete).toHaveBeenCalledWith('pe1')
  })

  it('returns 404 when the entry does not exist', async () => {
    AtlasPlanningEntry.findByIdAndDelete.mockResolvedValue(null)

    const app = createApp()
    const res = await request(app).delete('/api/atlas-planning-entries/missing')

    expect(res.status).toBe(404)
  })

  it('passes an unexpected error to the error handler (500)', async () => {
    AtlasPlanningEntry.findByIdAndDelete.mockRejectedValue(new Error('boom'))

    const app = createApp()
    const res = await request(app).delete('/api/atlas-planning-entries/pe1')

    expect(res.status).toBe(500)
  })
})
