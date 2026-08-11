import request from 'supertest'
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'

vi.mock('../src/services/sprintSync.ts', () => ({ getSprints: vi.fn() }))
vi.mock('../src/models/Team.ts', () => ({ Team: { findById: vi.fn() } }))

const { getSprints } = (await import('../src/services/sprintSync.ts')) as unknown as { getSprints: Mock }
const { Team } = (await import('../src/models/Team.ts')) as unknown as { Team: { findById: Mock } }
const { createApp } = await import('../src/app.ts')

describe('GET /api/sprints', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('rejects a missing teamId', async () => {
    const app = createApp()
    const res = await request(app).get('/api/sprints')
    expect(res.status).toBe(400)
    expect(getSprints).not.toHaveBeenCalled()
  })

  it('returns 404 when the team does not exist', async () => {
    Team.findById.mockResolvedValue(null)
    const app = createApp()
    const res = await request(app).get('/api/sprints').query({ teamId: 'nope' })
    expect(res.status).toBe(404)
  })

  it('returns the cache-first sprint list for a valid team', async () => {
    Team.findById.mockResolvedValue({ _id: 't1', name: 'Odyssey', jiraLabels: ['team-odyssey'] })
    getSprints.mockResolvedValue([
      { jiraSprintId: '632', name: 'WPMVP Sprint 132', state: 'active' },
      { jiraSprintId: '630', name: 'WPMVP Sprint 130', state: 'closed' },
    ])

    const app = createApp()
    const res = await request(app).get('/api/sprints').query({ teamId: 't1' })

    expect(res.status).toBe(200)
    expect(getSprints).toHaveBeenCalledTimes(1)
    expect(res.body).toHaveLength(2)
    expect(res.body[0]).toMatchObject({ jiraSprintId: '632', state: 'active' })
  })

  it('returns 502 when the cache is cold and the board cannot be resolved', async () => {
    Team.findById.mockResolvedValue({ _id: 't1' })
    getSprints.mockResolvedValue(null)

    const app = createApp()
    const res = await request(app).get('/api/sprints').query({ teamId: 't1' })

    expect(res.status).toBe(502)
  })
})
