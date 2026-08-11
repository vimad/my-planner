import request from 'supertest'
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'

interface MockedTeamMembershipModel {
  find: Mock
  create: Mock
  findByIdAndUpdate: Mock
  findByIdAndDelete: Mock
}

interface MockedPersonModel {
  findByIdAndDelete: Mock
}

vi.mock('../src/models/TeamMembership.ts', () => {
  return {
    TeamMembership: {
      find: vi.fn(),
      create: vi.fn(),
      findByIdAndUpdate: vi.fn(),
      findByIdAndDelete: vi.fn(),
    },
  }
})

// TeamMembership routes never touch Person — mocked here purely so the
// "removing a membership doesn't cascade-delete the Person" test below can
// assert it stays untouched (same posture as boards.route.test.ts's
// Todo/Note no-cascade mocks).
vi.mock('../src/models/Person.ts', () => {
  return {
    Person: {
      findByIdAndDelete: vi.fn(),
    },
  }
})

const { TeamMembership } = (await import('../src/models/TeamMembership.ts')) as unknown as {
  TeamMembership: MockedTeamMembershipModel
}
const { Person } = (await import('../src/models/Person.ts')) as unknown as { Person: MockedPersonModel }
const { createApp } = await import('../src/app.ts')

describe('TeamMembership routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('POST /api/team-memberships', () => {
    it('creates a membership with an explicit capacityPercentOverride', async () => {
      TeamMembership.create.mockResolvedValue({
        _id: 'm1',
        teamId: 't1',
        personId: 'p1',
        role: 'SE',
        capacityPercentOverride: 60,
      })

      const app = createApp()
      const res = await request(app)
        .post('/api/team-memberships')
        .send({ teamId: 't1', personId: 'p1', role: 'SE', capacityPercentOverride: 60 })

      expect(res.status).toBe(201)
      expect(res.body.capacityPercentOverride).toBe(60)
      expect(TeamMembership.create).toHaveBeenCalledWith({
        teamId: 't1',
        personId: 'p1',
        role: 'SE',
        capacityPercentOverride: 60,
      })
    })

    it('defaults capacityPercentOverride to null when omitted (falls back to the role default at read time)', async () => {
      TeamMembership.create.mockResolvedValue({
        _id: 'm1',
        teamId: 't1',
        personId: 'p1',
        role: 'SE',
        capacityPercentOverride: null,
      })

      const app = createApp()
      const res = await request(app).post('/api/team-memberships').send({ teamId: 't1', personId: 'p1', role: 'SE' })

      expect(res.status).toBe(201)
      expect(TeamMembership.create).toHaveBeenCalledWith({
        teamId: 't1',
        personId: 'p1',
        role: 'SE',
        capacityPercentOverride: null,
      })
    })

    it('rejects a missing/invalid role', async () => {
      const app = createApp()
      const res = await request(app)
        .post('/api/team-memberships')
        .send({ teamId: 't1', personId: 'p1', role: 'Wizard' })

      expect(res.status).toBe(400)
      expect(TeamMembership.create).not.toHaveBeenCalled()
    })

    it('rejects a duplicate (teamId, personId) membership with 409', async () => {
      TeamMembership.create.mockRejectedValue({ code: 11000 })

      const app = createApp()
      const res = await request(app)
        .post('/api/team-memberships')
        .send({ teamId: 't1', personId: 'p1', role: 'SE' })

      expect(res.status).toBe(409)
    })
  })

  describe('GET /api/team-memberships', () => {
    it("returns a team's roster with Person populated", async () => {
      const docs = [
        { _id: 'm1', teamId: 't1', personId: { _id: 'p1', name: 'Ada Lovelace' }, role: 'SE', capacityPercentOverride: null },
      ]
      const sort = vi.fn().mockResolvedValue(docs)
      const populate = vi.fn().mockReturnValue({ sort })
      TeamMembership.find.mockReturnValue({ populate })

      const app = createApp()
      const res = await request(app).get('/api/team-memberships').query({ teamId: 't1' })

      expect(res.status).toBe(200)
      expect(TeamMembership.find).toHaveBeenCalledWith({ teamId: 't1' })
      expect(populate).toHaveBeenCalledWith('personId')
      expect(res.body).toEqual(docs)
    })

    it('rejects a missing teamId', async () => {
      const app = createApp()
      const res = await request(app).get('/api/team-memberships')

      expect(res.status).toBe(400)
      expect(TeamMembership.find).not.toHaveBeenCalled()
    })
  })

  describe('PATCH /api/team-memberships/:id', () => {
    it('edits role', async () => {
      const populate = vi.fn().mockResolvedValue({ _id: 'm1', role: 'TL', capacityPercentOverride: null })
      TeamMembership.findByIdAndUpdate.mockReturnValue({ populate })

      const app = createApp()
      const res = await request(app).patch('/api/team-memberships/m1').send({ role: 'TL' })

      expect(res.status).toBe(200)
      expect(TeamMembership.findByIdAndUpdate).toHaveBeenCalledWith('m1', { role: 'TL' }, { returnDocument: 'after' })
    })

    it('sets an explicit capacityPercentOverride', async () => {
      const populate = vi.fn().mockResolvedValue({ _id: 'm1', role: 'SE', capacityPercentOverride: 65 })
      TeamMembership.findByIdAndUpdate.mockReturnValue({ populate })

      const app = createApp()
      const res = await request(app).patch('/api/team-memberships/m1').send({ capacityPercentOverride: 65 })

      expect(res.status).toBe(200)
      expect(TeamMembership.findByIdAndUpdate).toHaveBeenCalledWith(
        'm1',
        { capacityPercentOverride: 65 },
        { returnDocument: 'after' },
      )
    })

    it('sending capacityPercentOverride: null explicitly reverts to the role default', async () => {
      const populate = vi.fn().mockResolvedValue({ _id: 'm1', role: 'SE', capacityPercentOverride: null })
      TeamMembership.findByIdAndUpdate.mockReturnValue({ populate })

      const app = createApp()
      const res = await request(app).patch('/api/team-memberships/m1').send({ capacityPercentOverride: null })

      expect(res.status).toBe(200)
      expect(res.body.capacityPercentOverride).toBeNull()
      expect(TeamMembership.findByIdAndUpdate).toHaveBeenCalledWith(
        'm1',
        { capacityPercentOverride: null },
        { returnDocument: 'after' },
      )
    })

    it('omitting capacityPercentOverride entirely leaves it untouched', async () => {
      const populate = vi.fn().mockResolvedValue({ _id: 'm1', role: 'TL', capacityPercentOverride: 40 })
      TeamMembership.findByIdAndUpdate.mockReturnValue({ populate })

      const app = createApp()
      const res = await request(app).patch('/api/team-memberships/m1').send({ role: 'TL' })

      expect(res.status).toBe(200)
      expect(TeamMembership.findByIdAndUpdate).toHaveBeenCalledWith('m1', { role: 'TL' }, { returnDocument: 'after' })
    })

    it('returns 404 when the membership does not exist', async () => {
      const populate = vi.fn().mockResolvedValue(null)
      TeamMembership.findByIdAndUpdate.mockReturnValue({ populate })

      const app = createApp()
      const res = await request(app).patch('/api/team-memberships/does-not-exist').send({ role: 'TL' })

      expect(res.status).toBe(404)
    })
  })

  describe('DELETE /api/team-memberships/:id', () => {
    it('removes only the membership — the Person is never cascade-deleted', async () => {
      TeamMembership.findByIdAndDelete.mockResolvedValue({ _id: 'm1', teamId: 't1', personId: 'p1' })

      const app = createApp()
      const res = await request(app).delete('/api/team-memberships/m1')

      expect(res.status).toBe(204)
      expect(TeamMembership.findByIdAndDelete).toHaveBeenCalledWith('m1')
      expect(Person.findByIdAndDelete).not.toHaveBeenCalled()
    })

    it('returns 404 when the membership does not exist', async () => {
      TeamMembership.findByIdAndDelete.mockResolvedValue(null)

      const app = createApp()
      const res = await request(app).delete('/api/team-memberships/does-not-exist')

      expect(res.status).toBe(404)
    })
  })
})
