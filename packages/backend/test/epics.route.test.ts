import request from 'supertest'
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'

interface MockedSprintModel {
  findById: Mock
}
interface MockedTicketModel {
  distinct: Mock
  find: Mock
}
interface MockedEpicModel {
  find: Mock
}

vi.mock('../src/models/Sprint.ts', () => ({ Sprint: { findById: vi.fn() } }))
vi.mock('../src/models/Ticket.ts', () => ({ Ticket: { distinct: vi.fn(), find: vi.fn() } }))
vi.mock('../src/models/Epic.ts', () => ({ Epic: { find: vi.fn() } }))

const { Sprint } = (await import('../src/models/Sprint.ts')) as unknown as { Sprint: MockedSprintModel }
const { Ticket } = (await import('../src/models/Ticket.ts')) as unknown as { Ticket: MockedTicketModel }
const { Epic } = (await import('../src/models/Epic.ts')) as unknown as { Epic: MockedEpicModel }
const { createApp } = await import('../src/app.ts')

describe('GET /api/epics', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('rejects a missing sprintId', async () => {
    const app = createApp()
    const res = await request(app).get('/api/epics')
    expect(res.status).toBe(400)
  })

  it('returns 404 when the sprint does not exist', async () => {
    Sprint.findById.mockResolvedValue(null)
    const app = createApp()
    const res = await request(app).get('/api/epics').query({ sprintId: 'nope' })
    expect(res.status).toBe(404)
  })

  it('returns epics referenced by tickets in that sprint, each with a child-ticket rollup', async () => {
    Sprint.findById.mockResolvedValue({ _id: 's1', jiraSprintId: '632' })
    Ticket.distinct.mockResolvedValue(['WOSMVP-500', 'WOSMVP-600'])
    Epic.find.mockResolvedValue([
      { jiraKey: 'WOSMVP-500', title: 'Epic A', status: 'In Progress', toObject() {
        return { jiraKey: 'WOSMVP-500', title: 'Epic A', status: 'In Progress' }
      } },
      { jiraKey: 'WOSMVP-600', title: 'Epic B', status: 'To Do', toObject() {
        return { jiraKey: 'WOSMVP-600', title: 'Epic B', status: 'To Do' }
      } },
    ])
    Ticket.find.mockImplementation(async ({ epicKey }: { epicKey: string }) => {
      if (epicKey === 'WOSMVP-500') {
        return [{ status: 'Done' }, { status: 'Done' }, { status: 'In Progress' }]
      }
      return []
    })

    const app = createApp()
    const res = await request(app).get('/api/epics').query({ sprintId: 's1' })

    expect(res.status).toBe(200)
    expect(Ticket.distinct).toHaveBeenCalledWith('epicKey', { currentSprintKey: '632', epicKey: { $ne: null } })
    expect(res.body).toEqual([
      { jiraKey: 'WOSMVP-500', title: 'Epic A', status: 'In Progress', childCount: 3, doneCount: 2 },
      { jiraKey: 'WOSMVP-600', title: 'Epic B', status: 'To Do', childCount: 0, doneCount: 0 },
    ])
  })
})
