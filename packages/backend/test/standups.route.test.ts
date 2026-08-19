import request from 'supertest'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'

interface StandupEntryFixture {
  teamMembershipId: string
  totalSeconds: number
  activeStartedAt: Date | null
}

interface StandupFixture {
  _id: string
  teamId: string
  date: string
  entries: StandupEntryFixture[]
  endedAt: Date | null
  save: Mock
}

interface MockedStandupModel {
  create: Mock
  findOne: Mock
  findById: Mock
}

vi.mock('../src/models/Standup.ts', () => ({
  Standup: {
    create: vi.fn(),
    findOne: vi.fn(),
    findById: vi.fn(),
  },
}))

const { Standup } = (await import('../src/models/Standup.ts')) as unknown as { Standup: MockedStandupModel }
const { createApp } = await import('../src/app.ts')

function buildStandup(entries: StandupEntryFixture[], endedAt: Date | null = null): StandupFixture {
  return {
    _id: 'st1',
    teamId: 't1',
    date: '2026-08-19',
    entries,
    endedAt,
    save: vi.fn().mockResolvedValue(undefined),
  }
}

describe('Standup routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('GET /api/standups', () => {
    it('returns the standup for a (teamId, date) pair', async () => {
      const doc = { _id: 'st1', teamId: 't1', date: '2026-08-19', entries: [], endedAt: null }
      Standup.findOne.mockResolvedValue(doc)

      const app = createApp()
      const res = await request(app).get('/api/standups').query({ teamId: 't1', date: '2026-08-19' })

      expect(res.status).toBe(200)
      expect(Standup.findOne).toHaveBeenCalledWith({ teamId: 't1', date: '2026-08-19' })
      expect(res.body).toEqual(doc)
    })

    it('rejects a missing teamId/date', async () => {
      const app = createApp()
      const res = await request(app).get('/api/standups').query({ teamId: 't1' })

      expect(res.status).toBe(400)
      expect(Standup.findOne).not.toHaveBeenCalled()
    })

    it('returns 404 when no standup has been started for this day', async () => {
      Standup.findOne.mockResolvedValue(null)

      const app = createApp()
      const res = await request(app).get('/api/standups').query({ teamId: 't1', date: '2026-08-19' })

      expect(res.status).toBe(404)
    })

    it('rejects a malformed date', async () => {
      const app = createApp()
      const res = await request(app).get('/api/standups').query({ teamId: 't1', date: '19-08-2026' })

      expect(res.status).toBe(400)
      expect(Standup.findOne).not.toHaveBeenCalled()
    })
  })

  describe('POST /api/standups', () => {
    it('creates a standup with entries built from the given roster order', async () => {
      Standup.findOne.mockResolvedValue(null)
      Standup.create.mockResolvedValue({ _id: 'st1' })

      const app = createApp()
      const res = await request(app)
        .post('/api/standups')
        .send({ teamId: 't1', date: '2026-08-19', teamMembershipIds: ['m1', 'm2'] })

      expect(res.status).toBe(201)
      expect(Standup.create).toHaveBeenCalledWith({
        teamId: 't1',
        date: '2026-08-19',
        entries: [
          { teamMembershipId: 'm1', totalSeconds: 0, activeStartedAt: null },
          { teamMembershipId: 'm2', totalSeconds: 0, activeStartedAt: null },
        ],
      })
    })

    it('is idempotent - returns the already-started record instead of creating a second one', async () => {
      const existing = { _id: 'st1', teamId: 't1', date: '2026-08-19', entries: [], endedAt: null }
      Standup.findOne.mockResolvedValue(existing)

      const app = createApp()
      const res = await request(app)
        .post('/api/standups')
        .send({ teamId: 't1', date: '2026-08-19', teamMembershipIds: ['m1'] })

      expect(res.status).toBe(200)
      expect(res.body).toEqual(existing)
      expect(Standup.create).not.toHaveBeenCalled()
    })

    it('rejects a missing teamId/date', async () => {
      const app = createApp()
      const res = await request(app).post('/api/standups').send({ teamMembershipIds: ['m1'] })

      expect(res.status).toBe(400)
      expect(Standup.create).not.toHaveBeenCalled()
    })

    it('rejects a malformed date', async () => {
      const app = createApp()
      const res = await request(app)
        .post('/api/standups')
        .send({ teamId: 't1', date: '19-08-2026', teamMembershipIds: ['m1'] })

      expect(res.status).toBe(400)
      expect(Standup.create).not.toHaveBeenCalled()
    })

    it('rejects an empty teamMembershipIds', async () => {
      Standup.findOne.mockResolvedValue(null)
      const app = createApp()
      const res = await request(app)
        .post('/api/standups')
        .send({ teamId: 't1', date: '2026-08-19', teamMembershipIds: [] })

      expect(res.status).toBe(400)
      expect(Standup.create).not.toHaveBeenCalled()
    })

    it('falls back to the existing record on a race that trips the unique index', async () => {
      Standup.findOne.mockResolvedValueOnce(null)
      Standup.create.mockRejectedValue({ code: 11000 })
      const existing = { _id: 'st1', teamId: 't1', date: '2026-08-19', entries: [], endedAt: null }
      Standup.findOne.mockResolvedValueOnce(existing)

      const app = createApp()
      const res = await request(app)
        .post('/api/standups')
        .send({ teamId: 't1', date: '2026-08-19', teamMembershipIds: ['m1'] })

      expect(res.status).toBe(200)
      expect(res.body).toEqual(existing)
    })
  })

  describe('POST /api/standups/:id/timer/start', () => {
    it('starts the given person\'s timer', async () => {
      const standup = buildStandup([{ teamMembershipId: 'm1', totalSeconds: 0, activeStartedAt: null }])
      Standup.findById.mockResolvedValue(standup)

      const app = createApp()
      const res = await request(app).post('/api/standups/st1/timer/start').send({ teamMembershipId: 'm1' })

      expect(res.status).toBe(200)
      expect(standup.entries[0].activeStartedAt).toBeInstanceOf(Date)
      expect(standup.save).toHaveBeenCalled()
    })

    it('rejects a missing teamMembershipId', async () => {
      const app = createApp()
      const res = await request(app).post('/api/standups/st1/timer/start').send({})

      expect(res.status).toBe(400)
      expect(Standup.findById).not.toHaveBeenCalled()
    })

    it('returns 404 when the standup does not exist', async () => {
      Standup.findById.mockResolvedValue(null)

      const app = createApp()
      const res = await request(app).post('/api/standups/missing/timer/start').send({ teamMembershipId: 'm1' })

      expect(res.status).toBe(404)
    })

    it('rejects starting a timer once the standup has ended', async () => {
      const standup = buildStandup([{ teamMembershipId: 'm1', totalSeconds: 0, activeStartedAt: null }], new Date())
      Standup.findById.mockResolvedValue(standup)

      const app = createApp()
      const res = await request(app).post('/api/standups/st1/timer/start').send({ teamMembershipId: 'm1' })

      expect(res.status).toBe(400)
      expect(standup.save).not.toHaveBeenCalled()
    })

    it('rejects a person who is not on today\'s standup', async () => {
      const standup = buildStandup([{ teamMembershipId: 'm1', totalSeconds: 0, activeStartedAt: null }])
      Standup.findById.mockResolvedValue(standup)

      const app = createApp()
      const res = await request(app).post('/api/standups/st1/timer/start').send({ teamMembershipId: 'm2' })

      expect(res.status).toBe(400)
      expect(standup.save).not.toHaveBeenCalled()
    })

    it('rejects starting a timer that is already running for that person', async () => {
      const standup = buildStandup([{ teamMembershipId: 'm1', totalSeconds: 0, activeStartedAt: new Date() }])
      Standup.findById.mockResolvedValue(standup)

      const app = createApp()
      const res = await request(app).post('/api/standups/st1/timer/start').send({ teamMembershipId: 'm1' })

      expect(res.status).toBe(400)
      expect(standup.save).not.toHaveBeenCalled()
    })

    it('rejects starting a timer while a different person\'s timer is running', async () => {
      const standup = buildStandup([
        { teamMembershipId: 'm1', totalSeconds: 0, activeStartedAt: new Date() },
        { teamMembershipId: 'm2', totalSeconds: 0, activeStartedAt: null },
      ])
      Standup.findById.mockResolvedValue(standup)

      const app = createApp()
      const res = await request(app).post('/api/standups/st1/timer/start').send({ teamMembershipId: 'm2' })

      expect(res.status).toBe(400)
      expect(standup.save).not.toHaveBeenCalled()
    })
  })

  describe('POST /api/standups/:id/timer/stop', () => {
    it('folds the elapsed time into totalSeconds and clears activeStartedAt', async () => {
      const startedAt = new Date('2026-08-19T09:00:00.000Z')
      const standup = buildStandup([{ teamMembershipId: 'm1', totalSeconds: 10, activeStartedAt: startedAt }])
      Standup.findById.mockResolvedValue(standup)

      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-08-19T09:00:05.000Z'))

      const app = createApp()
      const res = await request(app).post('/api/standups/st1/timer/stop').send({ teamMembershipId: 'm1' })

      expect(res.status).toBe(200)
      expect(standup.entries[0].totalSeconds).toBe(15)
      expect(standup.entries[0].activeStartedAt).toBeNull()
      expect(standup.save).toHaveBeenCalled()
    })

    it('rejects stopping a timer that is not running', async () => {
      const standup = buildStandup([{ teamMembershipId: 'm1', totalSeconds: 0, activeStartedAt: null }])
      Standup.findById.mockResolvedValue(standup)

      const app = createApp()
      const res = await request(app).post('/api/standups/st1/timer/stop').send({ teamMembershipId: 'm1' })

      expect(res.status).toBe(400)
      expect(standup.save).not.toHaveBeenCalled()
    })

    it('returns 404 when the standup does not exist', async () => {
      Standup.findById.mockResolvedValue(null)

      const app = createApp()
      const res = await request(app).post('/api/standups/missing/timer/stop').send({ teamMembershipId: 'm1' })

      expect(res.status).toBe(404)
    })
  })

  describe('POST /api/standups/:id/end', () => {
    it('marks the standup ended', async () => {
      const standup = buildStandup([{ teamMembershipId: 'm1', totalSeconds: 30, activeStartedAt: null }])
      Standup.findById.mockResolvedValue(standup)

      const app = createApp()
      const res = await request(app).post('/api/standups/st1/end').send()

      expect(res.status).toBe(200)
      expect(standup.endedAt).toBeInstanceOf(Date)
      expect(standup.save).toHaveBeenCalled()
    })

    it('auto-stops a still-running timer, folding elapsed time into its total', async () => {
      const startedAt = new Date('2026-08-19T09:00:00.000Z')
      const standup = buildStandup([{ teamMembershipId: 'm1', totalSeconds: 5, activeStartedAt: startedAt }])
      Standup.findById.mockResolvedValue(standup)

      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-08-19T09:00:10.000Z'))

      const app = createApp()
      const res = await request(app).post('/api/standups/st1/end').send()

      expect(res.status).toBe(200)
      expect(standup.entries[0].totalSeconds).toBe(15)
      expect(standup.entries[0].activeStartedAt).toBeNull()
      expect(standup.endedAt).toBeInstanceOf(Date)
    })

    it('rejects ending a standup that has already ended', async () => {
      const standup = buildStandup([], new Date())
      Standup.findById.mockResolvedValue(standup)

      const app = createApp()
      const res = await request(app).post('/api/standups/st1/end').send()

      expect(res.status).toBe(400)
      expect(standup.save).not.toHaveBeenCalled()
    })

    it('returns 404 when the standup does not exist', async () => {
      Standup.findById.mockResolvedValue(null)

      const app = createApp()
      const res = await request(app).post('/api/standups/missing/end').send()

      expect(res.status).toBe(404)
    })
  })
})
