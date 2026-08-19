import request from 'supertest'
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'

interface MockedAtlasEpicModel {
  find: Mock
}
interface MockedAtlasTaskModel {
  find: Mock
}

vi.mock('../src/models/AtlasEpic.ts', () => ({ AtlasEpic: { find: vi.fn() } }))
vi.mock('../src/models/AtlasTask.ts', () => ({ AtlasTask: { find: vi.fn() } }))
vi.mock('../src/services/atlasSync.ts', async () => {
  const actual = await vi.importActual<typeof import('../src/services/atlasSync.ts')>('../src/services/atlasSync.ts')
  return {
    ...actual,
    trackAndSyncEpic: vi.fn(),
  }
})

const { AtlasEpic } = (await import('../src/models/AtlasEpic.ts')) as unknown as { AtlasEpic: MockedAtlasEpicModel }
const { AtlasTask } = (await import('../src/models/AtlasTask.ts')) as unknown as { AtlasTask: MockedAtlasTaskModel }
const { trackAndSyncEpic, EpicNotFoundError, NotAnEpicError } = (await import(
  '../src/services/atlasSync.ts'
)) as unknown as {
  trackAndSyncEpic: Mock
  EpicNotFoundError: typeof Error
  NotAnEpicError: typeof Error
}
const { createApp } = await import('../src/app.ts')

describe('POST /api/atlas/epics', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('rejects a missing jiraKey', async () => {
    const app = createApp()
    const res = await request(app).post('/api/atlas/epics').send({})
    expect(res.status).toBe(400)
    expect(trackAndSyncEpic).not.toHaveBeenCalled()
  })

  it('returns 201 with the synced epic + tasks on a valid epic key', async () => {
    trackAndSyncEpic.mockResolvedValue({
      epic: { _id: 'e1', jiraKey: 'WOSMVP-8262', title: 'The Epic' },
      tasks: [{ _id: 't1', jiraKey: 'WOSMVP-100', parentTaskId: null }],
    })

    const app = createApp()
    const res = await request(app).post('/api/atlas/epics').send({ jiraKey: 'WOSMVP-8262' })

    expect(trackAndSyncEpic).toHaveBeenCalledWith('WOSMVP-8262')
    expect(res.status).toBe(201)
    expect(res.body.epic.jiraKey).toBe('WOSMVP-8262')
    expect(res.body.tasks).toHaveLength(1)
  })

  it('returns 404 and saves nothing when the key does not resolve in Jira', async () => {
    trackAndSyncEpic.mockRejectedValue(new EpicNotFoundError('not found'))

    const app = createApp()
    const res = await request(app).post('/api/atlas/epics').send({ jiraKey: 'WOSMVP-9999' })

    expect(res.status).toBe(404)
    expect(res.body.error).toBeTruthy()
  })

  it('returns 422 when the key resolves to a non-Epic issue', async () => {
    trackAndSyncEpic.mockRejectedValue(new NotAnEpicError('not an epic'))

    const app = createApp()
    const res = await request(app).post('/api/atlas/epics').send({ jiraKey: 'WOSMVP-100' })

    expect(res.status).toBe(422)
    expect(res.body.error).toBeTruthy()
  })

  it('passes an unexpected error to the error handler (500)', async () => {
    trackAndSyncEpic.mockRejectedValue(new Error('boom'))

    const app = createApp()
    const res = await request(app).post('/api/atlas/epics').send({ jiraKey: 'WOSMVP-100' })

    expect(res.status).toBe(500)
  })
})

describe('GET /api/atlas/epics', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns tracked epics, each with its task tree nested by parentTaskId', async () => {
    AtlasEpic.find.mockReturnValue({
      sort: vi.fn().mockResolvedValue([
        {
          _id: 'e1',
          jiraKey: 'WOSMVP-8262',
          title: 'The Epic',
          toObject() {
            return { _id: 'e1', jiraKey: 'WOSMVP-8262', title: 'The Epic' }
          },
        },
      ]),
    })
    AtlasTask.find.mockResolvedValue([
      {
        _id: 't1',
        parentTaskId: null,
        jiraKey: 'WOSMVP-100',
        toObject() {
          return { _id: 't1', parentTaskId: null, jiraKey: 'WOSMVP-100' }
        },
      },
      {
        _id: 't2',
        parentTaskId: 't1',
        jiraKey: 'WOSMVP-101',
        toObject() {
          return { _id: 't2', parentTaskId: 't1', jiraKey: 'WOSMVP-101' }
        },
      },
    ])

    const app = createApp()
    const res = await request(app).get('/api/atlas/epics')

    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(1)
    expect(res.body[0].jiraKey).toBe('WOSMVP-8262')
    expect(res.body[0].tasks).toHaveLength(1)
    expect(res.body[0].tasks[0].jiraKey).toBe('WOSMVP-100')
    expect(res.body[0].tasks[0].subtasks).toHaveLength(1)
    expect(res.body[0].tasks[0].subtasks[0].jiraKey).toBe('WOSMVP-101')
  })

  it('returns an empty array when no epics are tracked', async () => {
    AtlasEpic.find.mockReturnValue({ sort: vi.fn().mockResolvedValue([]) })

    const app = createApp()
    const res = await request(app).get('/api/atlas/epics')

    expect(res.status).toBe(200)
    expect(res.body).toEqual([])
    expect(AtlasTask.find).not.toHaveBeenCalled()
  })
})
