import request from 'supertest'
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'

interface MockedTeamModel {
  findById: Mock
}

vi.mock('../src/models/Team.ts', () => ({ Team: { findById: vi.fn() } }))
vi.mock('../src/services/backlogCache.ts', () => ({ getBacklog: vi.fn(), refreshBacklog: vi.fn() }))

const { Team } = (await import('../src/models/Team.ts')) as unknown as { Team: MockedTeamModel }
const { getBacklog, refreshBacklog } = (await import('../src/services/backlogCache.ts')) as unknown as {
  getBacklog: Mock
  refreshBacklog: Mock
}
const { createApp } = await import('../src/app.ts')

const BACKLOG_TICKETS = [
  { key: 'WOSMVP-100', title: 'A story', type: 'Story', labels: ['Odyssey'], dev: { name: 'Ada' }, qa: null, assignee: null },
  { key: 'WOSMVP-200', title: 'A task', type: 'Task', labels: ['Odyssey'], dev: null, qa: null, assignee: { name: 'Bob' } },
]

describe('GET /api/tickets/backlog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('rejects a missing teamId', async () => {
    const app = createApp()
    const res = await request(app).get('/api/tickets/backlog').query({ category: 'tech-ops' })
    expect(res.status).toBe(400)
    expect(getBacklog).not.toHaveBeenCalled()
  })

  it('rejects a missing category', async () => {
    const app = createApp()
    const res = await request(app).get('/api/tickets/backlog').query({ teamId: 't1' })
    expect(res.status).toBe(400)
    expect(getBacklog).not.toHaveBeenCalled()
  })

  it('rejects a category outside the known three values', async () => {
    const app = createApp()
    const res = await request(app).get('/api/tickets/backlog').query({ teamId: 't1', category: 'nonsense' })
    expect(res.status).toBe(400)
    expect(getBacklog).not.toHaveBeenCalled()
  })

  it('returns 404 when the team does not exist', async () => {
    Team.findById.mockResolvedValue(null)
    const app = createApp()
    const res = await request(app).get('/api/tickets/backlog').query({ teamId: 't1', category: 'tech-ops' })
    expect(res.status).toBe(404)
  })

  it("calls getBacklog with the teamId, category, and the team's jiraLabels, returning its result", async () => {
    Team.findById.mockResolvedValue({ jiraLabels: ['Odyssey'] })
    getBacklog.mockResolvedValue(BACKLOG_TICKETS)

    const app = createApp()
    const res = await request(app).get('/api/tickets/backlog').query({ teamId: 't1', category: 'tech-ops' })

    expect(res.status).toBe(200)
    expect(getBacklog).toHaveBeenCalledWith('t1', 'tech-ops', ['Odyssey'])
    expect(res.body).toEqual(BACKLOG_TICKETS)
  })

  it('filters the result by key or title substring, case-insensitively, when q is given', async () => {
    Team.findById.mockResolvedValue({ jiraLabels: ['Odyssey'] })
    getBacklog.mockResolvedValue(BACKLOG_TICKETS)

    const app = createApp()
    const res = await request(app)
      .get('/api/tickets/backlog')
      .query({ teamId: 't1', category: 'tech-ops', q: 'story' })

    expect(res.status).toBe(200)
    expect(res.body).toEqual([BACKLOG_TICKETS[0]])
  })

  it('matches q against the ticket key too', async () => {
    Team.findById.mockResolvedValue({ jiraLabels: ['Odyssey'] })
    getBacklog.mockResolvedValue(BACKLOG_TICKETS)

    const app = createApp()
    const res = await request(app)
      .get('/api/tickets/backlog')
      .query({ teamId: 't1', category: 'tech-ops', q: 'WOSMVP-200' })

    expect(res.status).toBe(200)
    expect(res.body).toEqual([BACKLOG_TICKETS[1]])
  })

  it('returns 502 when getBacklog cannot resolve the board/sprint', async () => {
    Team.findById.mockResolvedValue({ jiraLabels: ['Odyssey'] })
    getBacklog.mockResolvedValue(null)

    const app = createApp()
    const res = await request(app).get('/api/tickets/backlog').query({ teamId: 't1', category: 'tech-ops' })

    expect(res.status).toBe(502)
  })

  it('returns an empty list (not an error) for a team with no jiraLabels', async () => {
    Team.findById.mockResolvedValue({ jiraLabels: [] })
    getBacklog.mockResolvedValue([])

    const app = createApp()
    const res = await request(app).get('/api/tickets/backlog').query({ teamId: 't1', category: 'product' })

    expect(res.status).toBe(200)
    expect(res.body).toEqual([])
  })
})

describe('POST /api/tickets/backlog/refresh', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('rejects a missing teamId', async () => {
    const app = createApp()
    const res = await request(app).post('/api/tickets/backlog/refresh').send({ category: 'tech-ops' })
    expect(res.status).toBe(400)
    expect(refreshBacklog).not.toHaveBeenCalled()
  })

  it('rejects a category outside the known three values', async () => {
    const app = createApp()
    const res = await request(app).post('/api/tickets/backlog/refresh').send({ teamId: 't1', category: 'nonsense' })
    expect(res.status).toBe(400)
    expect(refreshBacklog).not.toHaveBeenCalled()
  })

  it('returns 404 when the team does not exist', async () => {
    Team.findById.mockResolvedValue(null)
    const app = createApp()
    const res = await request(app).post('/api/tickets/backlog/refresh').send({ teamId: 't1', category: 'tech-ops' })
    expect(res.status).toBe(404)
  })

  it("calls refreshBacklog with the teamId, category, and the team's jiraLabels, returning its result", async () => {
    Team.findById.mockResolvedValue({ jiraLabels: ['Odyssey'] })
    refreshBacklog.mockResolvedValue(BACKLOG_TICKETS)

    const app = createApp()
    const res = await request(app).post('/api/tickets/backlog/refresh').send({ teamId: 't1', category: 'tech-ops' })

    expect(res.status).toBe(200)
    expect(refreshBacklog).toHaveBeenCalledWith('t1', 'tech-ops', ['Odyssey'])
    expect(res.body).toEqual(BACKLOG_TICKETS)
  })

  it('returns 502 when refreshBacklog cannot resolve the board/sprint', async () => {
    Team.findById.mockResolvedValue({ jiraLabels: ['Odyssey'] })
    refreshBacklog.mockResolvedValue(null)

    const app = createApp()
    const res = await request(app).post('/api/tickets/backlog/refresh').send({ teamId: 't1', category: 'tech-ops' })

    expect(res.status).toBe(502)
  })
})
