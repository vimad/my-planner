import request from 'supertest'
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'

interface MockedAtlasRosterMemberModel {
  find: Mock
  create: Mock
  findByIdAndDelete: Mock
}

vi.mock('../src/models/AtlasRosterMember.ts', () => {
  return {
    AtlasRosterMember: {
      find: vi.fn(),
      create: vi.fn(),
      findByIdAndDelete: vi.fn(),
    },
  }
})

const { AtlasRosterMember } = (await import('../src/models/AtlasRosterMember.ts')) as unknown as {
  AtlasRosterMember: MockedAtlasRosterMemberModel
}
const { createApp } = await import('../src/app.ts')

describe('AtlasRosterMember routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('POST /api/atlas/roster', () => {
    it('adds a person to the Atlas roster', async () => {
      AtlasRosterMember.create.mockResolvedValue({ _id: 'm1', personId: 'p1' })

      const app = createApp()
      const res = await request(app).post('/api/atlas/roster').send({ personId: 'p1' })

      expect(res.status).toBe(201)
      expect(AtlasRosterMember.create).toHaveBeenCalledWith({ personId: 'p1' })
    })

    it('rejects a missing personId', async () => {
      const app = createApp()
      const res = await request(app).post('/api/atlas/roster').send({})

      expect(res.status).toBe(400)
      expect(AtlasRosterMember.create).not.toHaveBeenCalled()
    })

    it('rejects a duplicate personId with 409', async () => {
      AtlasRosterMember.create.mockRejectedValue({ code: 11000 })

      const app = createApp()
      const res = await request(app).post('/api/atlas/roster').send({ personId: 'p1' })

      expect(res.status).toBe(409)
    })
  })

  describe('GET /api/atlas/roster', () => {
    it('returns the whole roster with Person populated', async () => {
      const docs = [{ _id: 'm1', personId: { _id: 'p1', name: 'Ada Lovelace' } }]
      const sort = vi.fn().mockResolvedValue(docs)
      const populate = vi.fn().mockReturnValue({ sort })
      AtlasRosterMember.find.mockReturnValue({ populate })

      const app = createApp()
      const res = await request(app).get('/api/atlas/roster')

      expect(res.status).toBe(200)
      expect(AtlasRosterMember.find).toHaveBeenCalledWith()
      expect(populate).toHaveBeenCalledWith('personId')
      expect(res.body).toEqual(docs)
    })
  })

  describe('DELETE /api/atlas/roster/:id', () => {
    it('removes only the roster entry — the Person is never cascade-deleted', async () => {
      AtlasRosterMember.findByIdAndDelete.mockResolvedValue({ _id: 'm1', personId: 'p1' })

      const app = createApp()
      const res = await request(app).delete('/api/atlas/roster/m1')

      expect(res.status).toBe(204)
      expect(AtlasRosterMember.findByIdAndDelete).toHaveBeenCalledWith('m1')
    })

    it('returns 404 when the roster entry does not exist', async () => {
      AtlasRosterMember.findByIdAndDelete.mockResolvedValue(null)

      const app = createApp()
      const res = await request(app).delete('/api/atlas/roster/does-not-exist')

      expect(res.status).toBe(404)
    })
  })
})
