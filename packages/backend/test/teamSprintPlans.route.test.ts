import request from 'supertest'
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'

interface MockedTeamSprintPlanModel {
  create: Mock
  findOne: Mock
  findByIdAndUpdate: Mock
}

vi.mock('../src/models/TeamSprintPlan.ts', () => {
  return {
    TeamSprintPlan: {
      create: vi.fn(),
      findOne: vi.fn(),
      findByIdAndUpdate: vi.fn(),
    },
  }
})

const { TeamSprintPlan } = (await import('../src/models/TeamSprintPlan.ts')) as unknown as {
  TeamSprintPlan: MockedTeamSprintPlanModel
}
const { createApp } = await import('../src/app.ts')

describe('TeamSprintPlan routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('POST /api/team-sprint-plans', () => {
    it('creates a plan with a server-computed workingDays, not a client-supplied one', async () => {
      TeamSprintPlan.create.mockResolvedValue({
        _id: 'p1',
        teamId: 't1',
        sprintId: 's1',
        startDate: '2026-08-03',
        endDate: '2026-08-07',
        holidays: [],
        workingDays: 5,
      })

      const app = createApp()
      const res = await request(app)
        .post('/api/team-sprint-plans')
        // 2026-08-03 (Mon) - 2026-08-07 (Fri): 5 working days.
        .send({ teamId: 't1', sprintId: 's1', startDate: '2026-08-03', endDate: '2026-08-07' })

      expect(res.status).toBe(201)
      expect(TeamSprintPlan.create).toHaveBeenCalledWith({
        teamId: 't1',
        sprintId: 's1',
        startDate: '2026-08-03',
        endDate: '2026-08-07',
        holidays: [],
        workingDays: 5,
      })
    })

    it('defaults holidays to [] when omitted, and computes workingDays around any that are supplied', async () => {
      TeamSprintPlan.create.mockResolvedValue({ _id: 'p1' })

      const app = createApp()
      await request(app)
        .post('/api/team-sprint-plans')
        .send({ teamId: 't1', sprintId: 's1', startDate: '2026-08-03', endDate: '2026-08-07', holidays: ['2026-08-05'] })

      expect(TeamSprintPlan.create).toHaveBeenCalledWith({
        teamId: 't1',
        sprintId: 's1',
        startDate: '2026-08-03',
        endDate: '2026-08-07',
        holidays: ['2026-08-05'],
        workingDays: 4,
      })
    })

    it('rejects a missing startDate/endDate', async () => {
      const app = createApp()
      const res = await request(app).post('/api/team-sprint-plans').send({ teamId: 't1', sprintId: 's1' })

      expect(res.status).toBe(400)
      expect(TeamSprintPlan.create).not.toHaveBeenCalled()
    })

    it('rejects endDate < startDate', async () => {
      const app = createApp()
      const res = await request(app)
        .post('/api/team-sprint-plans')
        .send({ teamId: 't1', sprintId: 's1', startDate: '2026-08-07', endDate: '2026-08-03' })

      expect(res.status).toBe(400)
      expect(TeamSprintPlan.create).not.toHaveBeenCalled()
    })

    it('rejects a duplicate (teamId, sprintId) pair with 409', async () => {
      TeamSprintPlan.create.mockRejectedValue({ code: 11000 })

      const app = createApp()
      const res = await request(app)
        .post('/api/team-sprint-plans')
        .send({ teamId: 't1', sprintId: 's1', startDate: '2026-08-03', endDate: '2026-08-07' })

      expect(res.status).toBe(409)
    })
  })

  describe('GET /api/team-sprint-plans', () => {
    it('returns the plan for a (teamId, sprintId) pair', async () => {
      const doc = { _id: 'p1', teamId: 't1', sprintId: 's1', startDate: '2026-08-03', endDate: '2026-08-07', holidays: [], workingDays: 5 }
      TeamSprintPlan.findOne.mockResolvedValue(doc)

      const app = createApp()
      const res = await request(app).get('/api/team-sprint-plans').query({ teamId: 't1', sprintId: 's1' })

      expect(res.status).toBe(200)
      expect(TeamSprintPlan.findOne).toHaveBeenCalledWith({ teamId: 't1', sprintId: 's1' })
      expect(res.body).toEqual(doc)
    })

    it('rejects a missing teamId/sprintId', async () => {
      const app = createApp()
      const res = await request(app).get('/api/team-sprint-plans').query({ teamId: 't1' })

      expect(res.status).toBe(400)
      expect(TeamSprintPlan.findOne).not.toHaveBeenCalled()
    })

    it('returns 404 when no plan has been entered yet', async () => {
      TeamSprintPlan.findOne.mockResolvedValue(null)

      const app = createApp()
      const res = await request(app).get('/api/team-sprint-plans').query({ teamId: 't1', sprintId: 's1' })

      expect(res.status).toBe(404)
    })
  })

  describe('PATCH /api/team-sprint-plans/:id', () => {
    it('recomputes and persists workingDays from new startDate/endDate/holidays', async () => {
      TeamSprintPlan.findByIdAndUpdate.mockResolvedValue({ _id: 'p1', workingDays: 4 })

      const app = createApp()
      const res = await request(app)
        .patch('/api/team-sprint-plans/p1')
        .send({ startDate: '2026-08-03', endDate: '2026-08-07', holidays: ['2026-08-05'] })

      expect(res.status).toBe(200)
      expect(TeamSprintPlan.findByIdAndUpdate).toHaveBeenCalledWith(
        'p1',
        { startDate: '2026-08-03', endDate: '2026-08-07', holidays: ['2026-08-05'], workingDays: 4 },
        { returnDocument: 'after' },
      )
    })

    it('defaults holidays to [] when omitted', async () => {
      TeamSprintPlan.findByIdAndUpdate.mockResolvedValue({ _id: 'p1', workingDays: 5 })

      const app = createApp()
      await request(app).patch('/api/team-sprint-plans/p1').send({ startDate: '2026-08-03', endDate: '2026-08-07' })

      expect(TeamSprintPlan.findByIdAndUpdate).toHaveBeenCalledWith(
        'p1',
        { startDate: '2026-08-03', endDate: '2026-08-07', holidays: [], workingDays: 5 },
        { returnDocument: 'after' },
      )
    })

    it('rejects a missing startDate/endDate', async () => {
      const app = createApp()
      const res = await request(app).patch('/api/team-sprint-plans/p1').send({})

      expect(res.status).toBe(400)
      expect(TeamSprintPlan.findByIdAndUpdate).not.toHaveBeenCalled()
    })

    it('rejects an invalid range the same way POST does', async () => {
      const app = createApp()
      const res = await request(app)
        .patch('/api/team-sprint-plans/p1')
        .send({ startDate: '2026-08-07', endDate: '2026-08-03' })

      expect(res.status).toBe(400)
      expect(TeamSprintPlan.findByIdAndUpdate).not.toHaveBeenCalled()
    })

    it('returns 404 when the plan does not exist', async () => {
      TeamSprintPlan.findByIdAndUpdate.mockResolvedValue(null)

      const app = createApp()
      const res = await request(app)
        .patch('/api/team-sprint-plans/does-not-exist')
        .send({ startDate: '2026-08-03', endDate: '2026-08-07' })

      expect(res.status).toBe(404)
    })
  })
})
