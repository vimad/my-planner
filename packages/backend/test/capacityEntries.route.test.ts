import request from 'supertest'
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'

interface MockedCapacityEntryModel {
  create: Mock
  findOne: Mock
  findByIdAndUpdate: Mock
}

vi.mock('../src/models/CapacityEntry.ts', () => {
  return {
    CapacityEntry: {
      create: vi.fn(),
      findOne: vi.fn(),
      findByIdAndUpdate: vi.fn(),
    },
  }
})

const { CapacityEntry } = (await import('../src/models/CapacityEntry.ts')) as unknown as {
  CapacityEntry: MockedCapacityEntryModel
}
const { createApp } = await import('../src/app.ts')

describe('CapacityEntry routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('POST /api/capacity-entries', () => {
    it('creates an entry with an explicit leaveDays', async () => {
      CapacityEntry.create.mockResolvedValue({ _id: 'e1', teamMembershipId: 'm1', sprintId: 's1', leaveDays: 1.5 })

      const app = createApp()
      const res = await request(app)
        .post('/api/capacity-entries')
        .send({ teamMembershipId: 'm1', sprintId: 's1', leaveDays: 1.5 })

      expect(res.status).toBe(201)
      expect(CapacityEntry.create).toHaveBeenCalledWith({ teamMembershipId: 'm1', sprintId: 's1', leaveDays: 1.5 })
    })

    it('defaults leaveDays to 0 when omitted', async () => {
      CapacityEntry.create.mockResolvedValue({ _id: 'e1', teamMembershipId: 'm1', sprintId: 's1', leaveDays: 0 })

      const app = createApp()
      const res = await request(app).post('/api/capacity-entries').send({ teamMembershipId: 'm1', sprintId: 's1' })

      expect(res.status).toBe(201)
      expect(CapacityEntry.create).toHaveBeenCalledWith({ teamMembershipId: 'm1', sprintId: 's1', leaveDays: 0 })
    })

    it('rejects a missing teamMembershipId/sprintId', async () => {
      const app = createApp()
      const res = await request(app).post('/api/capacity-entries').send({ teamMembershipId: 'm1' })

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
      const doc = { _id: 'e1', teamMembershipId: 'm1', sprintId: 's1', leaveDays: 1 }
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
    it('edits leaveDays', async () => {
      CapacityEntry.findByIdAndUpdate.mockResolvedValue({ _id: 'e1', leaveDays: 2 })

      const app = createApp()
      const res = await request(app).patch('/api/capacity-entries/e1').send({ leaveDays: 2 })

      expect(res.status).toBe(200)
      expect(CapacityEntry.findByIdAndUpdate).toHaveBeenCalledWith('e1', { leaveDays: 2 }, { new: true })
    })

    it('rejects a non-numeric leaveDays', async () => {
      const app = createApp()
      const res = await request(app).patch('/api/capacity-entries/e1').send({ leaveDays: 'two' })

      expect(res.status).toBe(400)
      expect(CapacityEntry.findByIdAndUpdate).not.toHaveBeenCalled()
    })

    it('returns 404 when the entry does not exist', async () => {
      CapacityEntry.findByIdAndUpdate.mockResolvedValue(null)

      const app = createApp()
      const res = await request(app).patch('/api/capacity-entries/does-not-exist').send({ leaveDays: 2 })

      expect(res.status).toBe(404)
    })
  })
})
