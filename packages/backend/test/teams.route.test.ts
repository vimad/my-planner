import request from 'supertest'
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'

// The mocked shape mirrors the vi.mock factory below, not the real
// mongoose.Model<TeamDoc> type — these are plain vi.fn() stubs at runtime,
// same posture as categories.route.test.ts.
interface MockedTeamModel {
  find: Mock
  create: Mock
  findByIdAndUpdate: Mock
  findByIdAndDelete: Mock
}

vi.mock('../src/models/Team.ts', () => {
  return {
    Team: {
      find: vi.fn(),
      create: vi.fn(),
      findByIdAndUpdate: vi.fn(),
      findByIdAndDelete: vi.fn(),
    },
  }
})

const { Team } = (await import('../src/models/Team.ts')) as unknown as { Team: MockedTeamModel }
const { createApp } = await import('../src/app.ts')

describe('Team routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('POST /api/teams', () => {
    it('creates a team with a name and jiraLabels', async () => {
      Team.create.mockResolvedValue({ _id: 't1', name: 'Odyssey', jiraLabels: ['team-odyssey'] })

      const app = createApp()
      const res = await request(app).post('/api/teams').send({ name: 'Odyssey', jiraLabels: ['team-odyssey'] })

      expect(res.status).toBe(201)
      expect(res.body).toEqual({ _id: 't1', name: 'Odyssey', jiraLabels: ['team-odyssey'] })
      expect(Team.create).toHaveBeenCalledWith({ name: 'Odyssey', jiraLabels: ['team-odyssey'] })
    })

    it('rejects a missing name', async () => {
      const app = createApp()
      const res = await request(app).post('/api/teams').send({ jiraLabels: ['team-odyssey'] })

      expect(res.status).toBe(400)
      expect(Team.create).not.toHaveBeenCalled()
    })

    it('rejects a missing jiraLabels', async () => {
      const app = createApp()
      const res = await request(app).post('/api/teams').send({ name: 'Odyssey' })

      expect(res.status).toBe(400)
      expect(Team.create).not.toHaveBeenCalled()
    })

    it('rejects an empty jiraLabels array', async () => {
      const app = createApp()
      const res = await request(app).post('/api/teams').send({ name: 'Odyssey', jiraLabels: [] })

      expect(res.status).toBe(400)
      expect(Team.create).not.toHaveBeenCalled()
    })
  })

  describe('GET /api/teams', () => {
    it('lists all teams in creation order', async () => {
      const docs = [
        { _id: 't1', name: 'Odyssey', jiraLabels: ['team-odyssey'] },
        { _id: 't2', name: 'Nova', jiraLabels: ['team-nova'] },
      ]
      Team.find.mockReturnValue({ sort: vi.fn().mockResolvedValue(docs) })

      const app = createApp()
      const res = await request(app).get('/api/teams')

      expect(res.status).toBe(200)
      expect(res.body).toEqual(docs)
    })
  })

  describe('PATCH /api/teams/:id', () => {
    it('renames a team', async () => {
      Team.findByIdAndUpdate.mockResolvedValue({ _id: 't1', name: 'Renamed', jiraLabels: ['team-odyssey'] })

      const app = createApp()
      const res = await request(app).patch('/api/teams/t1').send({ name: 'Renamed' })

      expect(res.status).toBe(200)
      expect(res.body.name).toBe('Renamed')
      expect(Team.findByIdAndUpdate).toHaveBeenCalledWith('t1', { name: 'Renamed' }, { returnDocument: 'after' })
    })

    it('edits jiraLabels', async () => {
      Team.findByIdAndUpdate.mockResolvedValue({ _id: 't1', name: 'Odyssey', jiraLabels: ['new-label'] })

      const app = createApp()
      const res = await request(app).patch('/api/teams/t1').send({ jiraLabels: ['new-label'] })

      expect(res.status).toBe(200)
      expect(Team.findByIdAndUpdate).toHaveBeenCalledWith('t1', { jiraLabels: ['new-label'] }, { returnDocument: 'after' })
    })

    it('returns 404 when the team does not exist', async () => {
      Team.findByIdAndUpdate.mockResolvedValue(null)

      const app = createApp()
      const res = await request(app).patch('/api/teams/does-not-exist').send({ name: 'x' })

      expect(res.status).toBe(404)
    })
  })

  describe('DELETE /api/teams/:id', () => {
    it('deletes a team', async () => {
      Team.findByIdAndDelete.mockResolvedValue({ _id: 't1' })

      const app = createApp()
      const res = await request(app).delete('/api/teams/t1')

      expect(res.status).toBe(204)
      expect(Team.findByIdAndDelete).toHaveBeenCalledWith('t1')
    })

    it('returns 404 when the team does not exist', async () => {
      Team.findByIdAndDelete.mockResolvedValue(null)

      const app = createApp()
      const res = await request(app).delete('/api/teams/does-not-exist')

      expect(res.status).toBe(404)
    })
  })
})
