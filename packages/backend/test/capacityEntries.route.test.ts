import request from 'supertest'
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'

interface MockedCapacityEntryModel {
  create: Mock
  findOne: Mock
  findById: Mock
  findByIdAndUpdate: Mock
}
interface MockedTeamMembershipModel {
  findById: Mock
}
interface MockedTeamSprintPlanModel {
  findOne: Mock
}

vi.mock('../src/models/CapacityEntry.ts', () => {
  return {
    CapacityEntry: {
      create: vi.fn(),
      findOne: vi.fn(),
      findById: vi.fn(),
      findByIdAndUpdate: vi.fn(),
    },
  }
})
vi.mock('../src/models/TeamMembership.ts', () => ({
  TeamMembership: { findById: vi.fn() },
}))
vi.mock('../src/models/TeamSprintPlan.ts', () => ({
  TeamSprintPlan: { findOne: vi.fn() },
}))

const { CapacityEntry } = (await import('../src/models/CapacityEntry.ts')) as unknown as {
  CapacityEntry: MockedCapacityEntryModel
}
const { TeamMembership } = (await import('../src/models/TeamMembership.ts')) as unknown as {
  TeamMembership: MockedTeamMembershipModel
}
const { TeamSprintPlan } = (await import('../src/models/TeamSprintPlan.ts')) as unknown as {
  TeamSprintPlan: MockedTeamSprintPlanModel
}
const { createApp } = await import('../src/app.ts')

describe('CapacityEntry routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('POST /api/capacity-entries', () => {
    it('creates an entry with explicit leaveEntries', async () => {
      const leaveEntries = [{ date: '2026-08-03', portion: 'full' }]
      CapacityEntry.create.mockResolvedValue({ _id: 'e1', teamMembershipId: 'm1', sprintId: 's1', leaveEntries })

      const app = createApp()
      const res = await request(app)
        .post('/api/capacity-entries')
        .send({ teamMembershipId: 'm1', sprintId: 's1', leaveEntries })

      expect(res.status).toBe(201)
      expect(CapacityEntry.create).toHaveBeenCalledWith({ teamMembershipId: 'm1', sprintId: 's1', leaveEntries })
    })

    it('defaults leaveEntries to [] when omitted', async () => {
      CapacityEntry.create.mockResolvedValue({ _id: 'e1', teamMembershipId: 'm1', sprintId: 's1', leaveEntries: [] })

      const app = createApp()
      const res = await request(app).post('/api/capacity-entries').send({ teamMembershipId: 'm1', sprintId: 's1' })

      expect(res.status).toBe(201)
      expect(CapacityEntry.create).toHaveBeenCalledWith({ teamMembershipId: 'm1', sprintId: 's1', leaveEntries: [] })
    })

    it('rejects a missing teamMembershipId/sprintId', async () => {
      const app = createApp()
      const res = await request(app).post('/api/capacity-entries').send({ teamMembershipId: 'm1' })

      expect(res.status).toBe(400)
      expect(CapacityEntry.create).not.toHaveBeenCalled()
    })

    it('rejects a malformed leaveEntries entry (bad portion)', async () => {
      const app = createApp()
      const res = await request(app)
        .post('/api/capacity-entries')
        .send({ teamMembershipId: 'm1', sprintId: 's1', leaveEntries: [{ date: '2026-08-03', portion: 'lots' }] })

      expect(res.status).toBe(400)
      expect(CapacityEntry.create).not.toHaveBeenCalled()
    })

    it('rejects a duplicate (teamMembershipId, sprintId) pair with 409', async () => {
      CapacityEntry.create.mockRejectedValue({ code: 11000 })

      const app = createApp()
      const res = await request(app).post('/api/capacity-entries').send({ teamMembershipId: 'm1', sprintId: 's1' })

      expect(res.status).toBe(409)
    })
  })

  describe('GET /api/capacity-entries', () => {
    it('returns the entry for a (teamMembershipId, sprintId) pair', async () => {
      const doc = { _id: 'e1', teamMembershipId: 'm1', sprintId: 's1', leaveEntries: [{ date: '2026-08-03', portion: 'half' }] }
      CapacityEntry.findOne.mockResolvedValue(doc)

      const app = createApp()
      const res = await request(app).get('/api/capacity-entries').query({ teamMembershipId: 'm1', sprintId: 's1' })

      expect(res.status).toBe(200)
      expect(CapacityEntry.findOne).toHaveBeenCalledWith({ teamMembershipId: 'm1', sprintId: 's1' })
      expect(res.body).toEqual(doc)
    })

    it('rejects a missing teamMembershipId/sprintId', async () => {
      const app = createApp()
      const res = await request(app).get('/api/capacity-entries').query({ teamMembershipId: 'm1' })

      expect(res.status).toBe(400)
      expect(CapacityEntry.findOne).not.toHaveBeenCalled()
    })

    it('returns 404 when no leave has been entered yet', async () => {
      CapacityEntry.findOne.mockResolvedValue(null)

      const app = createApp()
      const res = await request(app).get('/api/capacity-entries').query({ teamMembershipId: 'm1', sprintId: 's1' })

      expect(res.status).toBe(404)
    })
  })

  describe('PATCH /api/capacity-entries/:id', () => {
    function setUpWorkingRange() {
      CapacityEntry.findById.mockResolvedValue({ _id: 'e1', teamMembershipId: 'm1', sprintId: 's1' })
      TeamMembership.findById.mockResolvedValue({ _id: 'm1', teamId: 't1' })
      TeamSprintPlan.findOne.mockResolvedValue({
        teamId: 't1',
        sprintId: 's1',
        startDate: '2026-08-03',
        endDate: '2026-08-07',
        holidays: [],
      })
    }

    it('replaces leaveEntries wholesale when every date is within the sprint\'s current working dates', async () => {
      setUpWorkingRange()
      const leaveEntries = [
        { date: '2026-08-03', portion: 'full' },
        { date: '2026-08-04', portion: 'half' },
      ]
      CapacityEntry.findByIdAndUpdate.mockResolvedValue({ _id: 'e1', leaveEntries })

      const app = createApp()
      const res = await request(app).patch('/api/capacity-entries/e1').send({ leaveEntries })

      expect(res.status).toBe(200)
      expect(CapacityEntry.findByIdAndUpdate).toHaveBeenCalledWith('e1', { leaveEntries }, { returnDocument: 'after' })
    })

    it('rejects an entry whose date falls outside the sprint\'s current working dates (400)', async () => {
      setUpWorkingRange()
      const leaveEntries = [{ date: '2026-08-20', portion: 'full' }]

      const app = createApp()
      const res = await request(app).patch('/api/capacity-entries/e1').send({ leaveEntries })

      expect(res.status).toBe(400)
      expect(CapacityEntry.findByIdAndUpdate).not.toHaveBeenCalled()
    })

    it('rejects a malformed portion', async () => {
      setUpWorkingRange()
      const app = createApp()
      const res = await request(app)
        .patch('/api/capacity-entries/e1')
        .send({ leaveEntries: [{ date: '2026-08-03', portion: 'all-day' }] })

      expect(res.status).toBe(400)
      expect(CapacityEntry.findByIdAndUpdate).not.toHaveBeenCalled()
    })

    it('rejects a non-array leaveEntries', async () => {
      setUpWorkingRange()
      const app = createApp()
      const res = await request(app).patch('/api/capacity-entries/e1').send({ leaveEntries: 'nope' })

      expect(res.status).toBe(400)
      expect(CapacityEntry.findByIdAndUpdate).not.toHaveBeenCalled()
    })

    it('returns 404 when the entry does not exist', async () => {
      CapacityEntry.findById.mockResolvedValue(null)

      const app = createApp()
      const res = await request(app).patch('/api/capacity-entries/does-not-exist').send({ leaveEntries: [] })

      expect(res.status).toBe(404)
      expect(CapacityEntry.findByIdAndUpdate).not.toHaveBeenCalled()
    })
  })
})
