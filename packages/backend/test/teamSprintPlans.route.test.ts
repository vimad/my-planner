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
    it('creates a plan with workingDays', async () => {
      TeamSprintPlan.create.mockResolvedValue({ _id: 'p1', teamId: 't1', sprintId: 's1', workingDays: 10 })

      const app = createApp()
      const res = await request(app)
        .post('/api/team-sprint-plans')
        .send({ teamId: 't1', sprintId: 's1', workingDays: 10 })

      expect(res.status).toBe(201)
      expect(TeamSprintPlan.create).toHaveBeenCalledWith({ teamId: 't1', sprintId: 's1', workingDays: 10 })
    })

    it('rejects a missing/non-numeric workingDays', async () => {
      const app = createApp()
      const res = await request(app).post('/api/team-sprint-plans').send({ teamId: 't1', sprintId: 's1' })

      expect(res.status).toBe(400)
      expect(TeamSprintPlan.create).not.toHaveBeenCalled()
    })

    it('rejects a duplicate (teamId, sprintId) pair with 409', async () => {
      TeamSprintPlan.create.mockRejectedValue({ code: 11000 })

      const app = createApp()
      const res = await request(app)
        .post('/api/team-sprint-plans')
        .send({ teamId: 't1', sprintId: 's1', workingDays: 10 })

      expect(res.status).toBe(409)
    })
  })

  describe('GET /api/team-sprint-plans', () => {
    it('returns the plan for a (teamId, sprintId) pair', async () => {
      const doc = { _id: 'p1', teamId: 't1', sprintId: 's1', workingDays: 10 }
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
    it('edits workingDays', async () => {
      TeamSprintPlan.findByIdAndUpdate.mockResolvedValue({ _id: 'p1', workingDays: 9 })

      const app = createApp()
      const res = await request(app).patch('/api/team-sprint-plans/p1').send({ workingDays: 9 })

      expect(res.status).toBe(200)
      expect(TeamSprintPlan.findByIdAndUpdate).toHaveBeenCalledWith('p1', { workingDays: 9 }, { returnDocument: 'after' })
    })

    it('rejects a non-numeric workingDays', async () => {
      const app = createApp()
      const res = await request(app).patch('/api/team-sprint-plans/p1').send({ workingDays: 'ten' })

      expect(res.status).toBe(400)
      expect(TeamSprintPlan.findByIdAndUpdate).not.toHaveBeenCalled()
    })

    it('returns 404 when the plan does not exist', async () => {
      TeamSprintPlan.findByIdAndUpdate.mockResolvedValue(null)

      const app = createApp()
      const res = await request(app).patch('/api/team-sprint-plans/does-not-exist').send({ workingDays: 9 })

      expect(res.status).toBe(404)
    })
  })
})
