import request from 'supertest'
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'

vi.mock('../src/services/sprintSync.ts', () => ({
  getSprints: vi.fn(),
  searchJiraSprints: vi.fn(),
  importSprint: vi.fn(),
}))
vi.mock('../src/models/Team.ts', () => ({ Team: { findById: vi.fn() } }))

const { getSprints, searchJiraSprints, importSprint } = (await import('../src/services/sprintSync.ts')) as unknown as {
  getSprints: Mock
  searchJiraSprints: Mock
  importSprint: Mock
}
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

describe('GET /api/sprints/search', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('rejects a missing teamId', async () => {
    const app = createApp()
    const res = await request(app).get('/api/sprints/search').query({ q: 'sprint' })
    expect(res.status).toBe(400)
    expect(searchJiraSprints).not.toHaveBeenCalled()
  })

  it('returns 404 when the team does not exist', async () => {
    Team.findById.mockResolvedValue(null)
    const app = createApp()
    const res = await request(app).get('/api/sprints/search').query({ teamId: 'nope', q: 'sprint' })
    expect(res.status).toBe(404)
  })

  it('returns the live filtered Jira results for a valid team', async () => {
    Team.findById.mockResolvedValue({ _id: 't1' })
    searchJiraSprints.mockResolvedValue([{ id: 134, name: 'WOSMVP Sprint 134', state: 'future' }])

    const app = createApp()
    const res = await request(app).get('/api/sprints/search').query({ teamId: 't1', q: '134' })

    expect(res.status).toBe(200)
    expect(searchJiraSprints).toHaveBeenCalledWith('134')
    expect(res.body).toEqual([{ id: 134, name: 'WOSMVP Sprint 134', state: 'future' }])
  })

  it('treats a missing q as a blank query', async () => {
    Team.findById.mockResolvedValue({ _id: 't1' })
    searchJiraSprints.mockResolvedValue([])

    const app = createApp()
    await request(app).get('/api/sprints/search').query({ teamId: 't1' })

    expect(searchJiraSprints).toHaveBeenCalledWith('')
  })

  it('returns 502 when the board cannot be resolved', async () => {
    Team.findById.mockResolvedValue({ _id: 't1' })
    searchJiraSprints.mockResolvedValue(null)

    const app = createApp()
    const res = await request(app).get('/api/sprints/search').query({ teamId: 't1', q: 'x' })

    expect(res.status).toBe(502)
  })
})

describe('POST /api/sprints', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('rejects a missing teamId or jiraSprintId', async () => {
    const app = createApp()
    const res1 = await request(app).post('/api/sprints').send({ jiraSprintId: 134 })
    expect(res1.status).toBe(400)

    const res2 = await request(app).post('/api/sprints').send({ teamId: 't1' })
    expect(res2.status).toBe(400)
    expect(importSprint).not.toHaveBeenCalled()
  })

  it('returns 404 when the team does not exist', async () => {
    Team.findById.mockResolvedValue(null)
    const app = createApp()
    const res = await request(app).post('/api/sprints').send({ teamId: 'nope', jiraSprintId: 134 })
    expect(res.status).toBe(404)
    expect(importSprint).not.toHaveBeenCalled()
  })

  it('imports and upserts the sprint for a valid team', async () => {
    Team.findById.mockResolvedValue({ _id: 't1' })
    importSprint.mockResolvedValue({ jiraSprintId: '134', name: 'WOSMVP Sprint 134', state: 'future' })

    const app = createApp()
    const res = await request(app).post('/api/sprints').send({ teamId: 't1', jiraSprintId: 134 })

    expect(res.status).toBe(200)
    expect(importSprint).toHaveBeenCalledWith(134)
    expect(res.body).toMatchObject({ jiraSprintId: '134', state: 'future' })
  })

  it('calling it twice for the same id is idempotent at the route level too', async () => {
    Team.findById.mockResolvedValue({ _id: 't1' })
    importSprint.mockResolvedValue({ jiraSprintId: '134', name: 'WOSMVP Sprint 134', state: 'future' })

    const app = createApp()
    const res1 = await request(app).post('/api/sprints').send({ teamId: 't1', jiraSprintId: 134 })
    const res2 = await request(app).post('/api/sprints').send({ teamId: 't1', jiraSprintId: 134 })

    expect(res1.status).toBe(200)
    expect(res2.status).toBe(200)
    expect(importSprint).toHaveBeenCalledTimes(2)
  })

  it('returns 502 when Jira does not have that sprint id', async () => {
    Team.findById.mockResolvedValue({ _id: 't1' })
    importSprint.mockRejectedValue(new Error('Jira request failed: 404 Not Found (/rest/agile/1.0/sprint/999999)'))

    const app = createApp()
    const res = await request(app).post('/api/sprints').send({ teamId: 't1', jiraSprintId: 999999 })

    expect(res.status).toBe(502)
  })
})
