import request from 'supertest'
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'

interface MockedCapacityLookupModel {
  create: Mock
  find: Mock
  findByIdAndUpdate: Mock
  findByIdAndDelete: Mock
}

vi.mock('../src/models/CapacityLookup.ts', () => {
  return {
    CapacityLookup: {
      create: vi.fn(),
      find: vi.fn(),
      findByIdAndUpdate: vi.fn(),
      findByIdAndDelete: vi.fn(),
    },
  }
})

const { CapacityLookup } = (await import('../src/models/CapacityLookup.ts')) as unknown as {
  CapacityLookup: MockedCapacityLookupModel
}
const { createApp } = await import('../src/app.ts')

describe('CapacityLookup routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('POST /api/capacity-lookup', () => {
    it('creates a row', async () => {
      CapacityLookup.create.mockResolvedValue({ _id: 'l1', percentage: 80, days: 9, hours: 58 })

      const app = createApp()
      const res = await request(app).post('/api/capacity-lookup').send({ percentage: 80, days: 9, hours: 58 })

      expect(res.status).toBe(201)
      expect(CapacityLookup.create).toHaveBeenCalledWith({ percentage: 80, days: 9, hours: 58 })
    })

    it('rejects a missing/non-numeric field', async () => {
      const app = createApp()
      const res = await request(app).post('/api/capacity-lookup').send({ percentage: 80, days: 9 })

      expect(res.status).toBe(400)
      expect(CapacityLookup.create).not.toHaveBeenCalled()
    })

    it('rejects a duplicate (percentage, days) pair with 409', async () => {
      CapacityLookup.create.mockRejectedValue({ code: 11000 })

      const app = createApp()
      const res = await request(app).post('/api/capacity-lookup').send({ percentage: 80, days: 9, hours: 58 })

      expect(res.status).toBe(409)
    })
  })

  describe('GET /api/capacity-lookup', () => {
    it('lists every row', async () => {
      const docs = [{ _id: 'l1', percentage: 50, days: 7, hours: 28 }]
      const sort = vi.fn().mockResolvedValue(docs)
      CapacityLookup.find.mockReturnValue({ sort })

      const app = createApp()
      const res = await request(app).get('/api/capacity-lookup')

      expect(res.status).toBe(200)
      expect(sort).toHaveBeenCalledWith({ percentage: 1, days: 1 })
      expect(res.body).toEqual(docs)
    })
  })

  describe('PATCH /api/capacity-lookup/:id', () => {
    it('edits hours', async () => {
      CapacityLookup.findByIdAndUpdate.mockResolvedValue({ _id: 'l1', percentage: 80, days: 9, hours: 60 })

      const app = createApp()
      const res = await request(app).patch('/api/capacity-lookup/l1').send({ hours: 60 })

      expect(res.status).toBe(200)
      expect(CapacityLookup.findByIdAndUpdate).toHaveBeenCalledWith('l1', { hours: 60 }, { returnDocument: 'after' })
    })

    it('returns 404 when the row does not exist', async () => {
      CapacityLookup.findByIdAndUpdate.mockResolvedValue(null)

      const app = createApp()
      const res = await request(app).patch('/api/capacity-lookup/does-not-exist').send({ hours: 60 })

      expect(res.status).toBe(404)
    })

    it('rejects an update that collides with another (percentage, days) pair with 409', async () => {
      CapacityLookup.findByIdAndUpdate.mockRejectedValue({ code: 11000 })

      const app = createApp()
      const res = await request(app).patch('/api/capacity-lookup/l1').send({ percentage: 50, days: 7 })

      expect(res.status).toBe(409)
    })
  })

  describe('DELETE /api/capacity-lookup/:id', () => {
    it('deletes a row', async () => {
      CapacityLookup.findByIdAndDelete.mockResolvedValue({ _id: 'l1' })

      const app = createApp()
      const res = await request(app).delete('/api/capacity-lookup/l1')

      expect(res.status).toBe(204)
      expect(CapacityLookup.findByIdAndDelete).toHaveBeenCalledWith('l1')
    })

    it('returns 404 when the row does not exist', async () => {
      CapacityLookup.findByIdAndDelete.mockResolvedValue(null)

      const app = createApp()
      const res = await request(app).delete('/api/capacity-lookup/does-not-exist')

      expect(res.status).toBe(404)
    })
  })
})
