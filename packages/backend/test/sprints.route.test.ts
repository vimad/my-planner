import request from 'supertest'
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'

vi.mock('../src/services/jiraClient.ts', () => ({
  resolveBoard: vi.fn(),
  listSprints: vi.fn(),
}))

interface MockedTeamModel {
  findById: Mock
}
interface MockedSprintModel {
  findOneAndUpdate: Mock
}

vi.mock('../src/models/Team.ts', () => ({ Team: { findById: vi.fn() } }))
vi.mock('../src/models/Sprint.ts', () => ({ Sprint: { findOneAndUpdate: vi.fn() } }))

const { resolveBoard, listSprints } = (await import('../src/services/jiraClient.ts')) as unknown as {
  resolveBoard: Mock
  listSprints: Mock
}
const { Team } = (await import('../src/models/Team.ts')) as unknown as { Team: MockedTeamModel }
const { Sprint } = (await import('../src/models/Sprint.ts')) as unknown as { Sprint: MockedSprintModel }
const { createApp } = await import('../src/app.ts')

describe('GET /api/sprints', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('rejects a missing teamId', async () => {
    const app = createApp()
    const res = await request(app).get('/api/sprints')
    expect(res.status).toBe(400)
    expect(resolveBoard).not.toHaveBeenCalled()
  })

  it('returns 404 when the team does not exist', async () => {
    Team.findById.mockResolvedValue(null)
    const app = createApp()
    const res = await request(app).get('/api/sprints').query({ teamId: 'nope' })
    expect(res.status).toBe(404)
  })

  it('resolves the WOSMVP/Odyssey board and upserts every returned sprint', async () => {
    Team.findById.mockResolvedValue({ _id: 't1', name: 'Odyssey', jiraLabels: ['team-odyssey'] })
    resolveBoard.mockResolvedValue({ id: 235, name: 'Odyssey', type: 'scrum' })
    listSprints.mockResolvedValue([
      { id: 630, name: 'WPMVP Sprint 130', state: 'closed', startDate: '2026-07-01T00:00:00Z', endDate: '2026-07-12T00:00:00Z' },
      { id: 632, name: 'WPMVP Sprint 132', state: 'active' },
    ])
    Sprint.findOneAndUpdate.mockImplementation(async (filter: { jiraSprintId: string }, update: unknown) => ({
      _id: `sprint-${filter.jiraSprintId}`,
      ...(update as Record<string, unknown>),
    }))

    const app = createApp()
    const res = await request(app).get('/api/sprints').query({ teamId: 't1' })

    expect(res.status).toBe(200)
    expect(resolveBoard).toHaveBeenCalledWith('WOSMVP', 'Odyssey')
    expect(listSprints).toHaveBeenCalledWith(235, ['active', 'future', 'closed'])
    expect(Sprint.findOneAndUpdate).toHaveBeenCalledTimes(2)
    expect(res.body).toHaveLength(2)
    expect(res.body[0]).toMatchObject({ jiraSprintId: '630', name: 'WPMVP Sprint 130', state: 'closed' })
    expect(res.body[1]).toMatchObject({ jiraSprintId: '632', name: 'WPMVP Sprint 132', state: 'active', startDate: null })
  })

  it('returns 502 when the board cannot be resolved', async () => {
    Team.findById.mockResolvedValue({ _id: 't1' })
    resolveBoard.mockResolvedValue(null)

    const app = createApp()
    const res = await request(app).get('/api/sprints').query({ teamId: 't1' })

    expect(res.status).toBe(502)
    expect(listSprints).not.toHaveBeenCalled()
  })
})
