import request from 'supertest'
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'

interface MockedTeamModel {
  findById: Mock
}
interface MockedPersonModel {
  findById: Mock
}
interface MockedSprintModel {
  findById: Mock
}

vi.mock('../src/models/Team.ts', () => ({ Team: { findById: vi.fn() } }))
vi.mock('../src/models/Person.ts', () => ({ Person: { findById: vi.fn() } }))
vi.mock('../src/models/Sprint.ts', () => ({ Sprint: { findById: vi.fn() } }))
vi.mock('../src/services/ticketSync.ts', () => ({ lightweightSyncTickets: vi.fn() }))
vi.mock('../src/services/statusSync.ts', () => ({ refreshStatusSet: vi.fn() }))

const { Team } = (await import('../src/models/Team.ts')) as unknown as { Team: MockedTeamModel }
const { Person } = (await import('../src/models/Person.ts')) as unknown as { Person: MockedPersonModel }
const { Sprint } = (await import('../src/models/Sprint.ts')) as unknown as { Sprint: MockedSprintModel }
const { lightweightSyncTickets } = (await import('../src/services/ticketSync.ts')) as unknown as {
  lightweightSyncTickets: Mock
}
const { refreshStatusSet } = (await import('../src/services/statusSync.ts')) as unknown as { refreshStatusSet: Mock }
const { createApp } = await import('../src/app.ts')

describe('POST /api/status-sync', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('rejects a missing teamId/personId/sprintId', async () => {
    const app = createApp()
    const res = await request(app).post('/api/status-sync').send({ teamId: 't1' })

    expect(res.status).toBe(400)
    expect(lightweightSyncTickets).not.toHaveBeenCalled()
  })

  it('returns 404 when the team does not exist', async () => {
    Team.findById.mockResolvedValue(null)
    const app = createApp()
    const res = await request(app).post('/api/status-sync').send({ teamId: 't1', personId: 'p1', sprintId: 's1' })
    expect(res.status).toBe(404)
  })

  it('returns 404 when the person does not exist', async () => {
    Team.findById.mockResolvedValue({ jiraLabels: ['Odyssey'] })
    Person.findById.mockResolvedValue(null)
    const app = createApp()
    const res = await request(app).post('/api/status-sync').send({ teamId: 't1', personId: 'p1', sprintId: 's1' })
    expect(res.status).toBe(404)
  })

  it('returns 404 when the sprint does not exist', async () => {
    Team.findById.mockResolvedValue({ jiraLabels: ['Odyssey'] })
    Person.findById.mockResolvedValue({ jiraAccountId: 'acct-1' })
    Sprint.findById.mockResolvedValue(null)
    const app = createApp()
    const res = await request(app).post('/api/status-sync').send({ teamId: 't1', personId: 'p1', sprintId: 's1' })
    expect(res.status).toBe(404)
  })

  it('runs a JQL search scoped to the person, sprint and team label, then refreshes the Status set', async () => {
    Team.findById.mockResolvedValue({ jiraLabels: ['Odyssey'] })
    Person.findById.mockResolvedValue({ jiraAccountId: 'acct-1' })
    Sprint.findById.mockResolvedValue({ jiraSprintId: '632' })
    const tickets = [{ jiraKey: 'WOSMVP-900', title: 'Discovered', status: 'In Progress', type: null }]
    lightweightSyncTickets.mockResolvedValue(tickets)

    const app = createApp()
    const res = await request(app).post('/api/status-sync').send({ teamId: 't1', personId: 'p1', sprintId: 's1' })

    expect(res.status).toBe(200)
    expect(res.body).toEqual(tickets)
    expect(lightweightSyncTickets).toHaveBeenCalledWith(
      'assignee = "acct-1" AND sprint = 632 AND labels in ("Odyssey")',
    )
    expect(refreshStatusSet).toHaveBeenCalledTimes(1)
  })
})
