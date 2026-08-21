import request from 'supertest'
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'

interface MockedAtlasEpicModel {
  find: Mock
  findOne: Mock
  findById: Mock
  findByIdAndUpdate: Mock
  findByIdAndDelete: Mock
}
interface MockedAtlasTaskModel {
  find: Mock
  deleteMany: Mock
}

vi.mock('../src/models/AtlasEpic.ts', () => ({
  AtlasEpic: {
    find: vi.fn(),
    findOne: vi.fn(),
    findById: vi.fn(),
    findByIdAndUpdate: vi.fn(),
    findByIdAndDelete: vi.fn(),
  },
}))
vi.mock('../src/models/AtlasTask.ts', () => ({ AtlasTask: { find: vi.fn(), deleteMany: vi.fn() } }))
vi.mock('../src/services/atlasSync.ts', async () => {
  const actual = await vi.importActual<typeof import('../src/services/atlasSync.ts')>('../src/services/atlasSync.ts')
  return {
    ...actual,
    trackAndSyncEpic: vi.fn(),
    trackAndSyncTicket: vi.fn(),
    trackAndSyncStandaloneTask: vi.fn(),
  }
})

const { AtlasEpic } = (await import('../src/models/AtlasEpic.ts')) as unknown as { AtlasEpic: MockedAtlasEpicModel }
const { AtlasTask } = (await import('../src/models/AtlasTask.ts')) as unknown as { AtlasTask: MockedAtlasTaskModel }
const { trackAndSyncEpic, trackAndSyncTicket, trackAndSyncStandaloneTask, EpicNotFoundError, NotAnEpicError, TicketAlreadyTrackedError } =
  (await import('../src/services/atlasSync.ts')) as unknown as {
    trackAndSyncEpic: Mock
    trackAndSyncTicket: Mock
    trackAndSyncStandaloneTask: Mock
    EpicNotFoundError: typeof Error
    NotAnEpicError: typeof Error
    TicketAlreadyTrackedError: typeof Error
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
    expect(trackAndSyncTicket).not.toHaveBeenCalled()
  })

  it('returns 201 with the synced epic + tasks on a valid epic key', async () => {
    trackAndSyncTicket.mockResolvedValue({
      epic: { _id: 'e1', jiraKey: 'WOSMVP-8262', title: 'The Epic' },
      tasks: [{ _id: 't1', jiraKey: 'WOSMVP-100', parentTaskId: null }],
    })

    const app = createApp()
    const res = await request(app).post('/api/atlas/epics').send({ jiraKey: 'WOSMVP-8262' })

    expect(trackAndSyncTicket).toHaveBeenCalledWith('WOSMVP-8262')
    expect(res.status).toBe(201)
    expect(res.body.epic.jiraKey).toBe('WOSMVP-8262')
    expect(res.body.tasks).toHaveLength(1)
  })

  it('returns 201 with the synced "Outside the program" epic + task on a valid non-Epic ticket key', async () => {
    trackAndSyncTicket.mockResolvedValue({
      epic: { _id: 'outside-epic', jiraKey: '__outside-program__', title: 'Outside the program', isOutsideProgram: true },
      tasks: [{ _id: 't1', jiraKey: 'WOSMVP-500', parentTaskId: null }],
    })

    const app = createApp()
    const res = await request(app).post('/api/atlas/epics').send({ jiraKey: 'WOSMVP-500' })

    expect(trackAndSyncTicket).toHaveBeenCalledWith('WOSMVP-500')
    expect(res.status).toBe(201)
    expect(res.body.epic.isOutsideProgram).toBe(true)
    expect(res.body.tasks).toHaveLength(1)
  })

  it('returns 404 and saves nothing when the key does not resolve in Jira', async () => {
    trackAndSyncTicket.mockRejectedValue(new EpicNotFoundError('not found'))

    const app = createApp()
    const res = await request(app).post('/api/atlas/epics').send({ jiraKey: 'WOSMVP-9999' })

    expect(res.status).toBe(404)
    expect(res.body.error).toBeTruthy()
  })

  it('returns 422 when the key resolves to a non-Epic issue', async () => {
    trackAndSyncTicket.mockRejectedValue(new NotAnEpicError('not an epic'))

    const app = createApp()
    const res = await request(app).post('/api/atlas/epics').send({ jiraKey: 'WOSMVP-100' })

    expect(res.status).toBe(422)
    expect(res.body.error).toBeTruthy()
  })

  it('returns 409 when the key is already tracked elsewhere (real epic or another sub-task)', async () => {
    trackAndSyncTicket.mockRejectedValue(new TicketAlreadyTrackedError('WOSMVP-500 is already tracked under epic WOSMVP-1'))

    const app = createApp()
    const res = await request(app).post('/api/atlas/epics').send({ jiraKey: 'WOSMVP-500' })

    expect(res.status).toBe(409)
    expect(res.body.error).toBeTruthy()
  })

  it('passes an unexpected error to the error handler (500)', async () => {
    trackAndSyncTicket.mockRejectedValue(new Error('boom'))

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

// Ticket 10: epic-level notes editing and un-track/restore (archive flag),
// mirroring routes/atlasTasks.ts's PATCH /:id partial-update convention.
describe('PATCH /api/atlas/epics/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('saves notes and derives notesText from the Tiptap JSON', async () => {
    AtlasEpic.findByIdAndUpdate.mockResolvedValue({ _id: 'e1' })
    const notes = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Vendor delay' }] }] }

    const app = createApp()
    const res = await request(app).patch('/api/atlas/epics/e1').send({ notes })

    expect(res.status).toBe(200)
    const [id, update] = AtlasEpic.findByIdAndUpdate.mock.calls[0]
    expect(id).toBe('e1')
    expect(update.notes).toEqual(notes)
    expect(update.notesText).toBe('Vendor delay')
  })

  it('clearing notes back to null also clears notesText', async () => {
    AtlasEpic.findByIdAndUpdate.mockResolvedValue({ _id: 'e1' })

    const app = createApp()
    const res = await request(app).patch('/api/atlas/epics/e1').send({ notes: null })

    expect(res.status).toBe(200)
    const [, update] = AtlasEpic.findByIdAndUpdate.mock.calls[0]
    expect(update.notes).toBeNull()
    expect(update.notesText).toBe('')
  })

  it('sets archived: true to un-track an epic (soft-delete, not a hard delete)', async () => {
    AtlasEpic.findByIdAndUpdate.mockResolvedValue({ _id: 'e1', archived: true })

    const app = createApp()
    const res = await request(app).patch('/api/atlas/epics/e1').send({ archived: true })

    expect(res.status).toBe(200)
    const [, update] = AtlasEpic.findByIdAndUpdate.mock.calls[0]
    expect(update).toEqual({ archived: true })
  })

  it('sets archived: false to restore a previously un-tracked epic', async () => {
    AtlasEpic.findByIdAndUpdate.mockResolvedValue({ _id: 'e1', archived: false })

    const app = createApp()
    const res = await request(app).patch('/api/atlas/epics/e1').send({ archived: false })

    expect(res.status).toBe(200)
    const [, update] = AtlasEpic.findByIdAndUpdate.mock.calls[0]
    expect(update).toEqual({ archived: false })
  })

  it('a request that never mentions archived never touches it at all', async () => {
    AtlasEpic.findByIdAndUpdate.mockResolvedValue({ _id: 'e1' })

    const app = createApp()
    await request(app).patch('/api/atlas/epics/e1').send({ notes: null })

    const [, update] = AtlasEpic.findByIdAndUpdate.mock.calls[0]
    expect(update).not.toHaveProperty('archived')
  })

  it('returns 404 when the epic does not exist', async () => {
    AtlasEpic.findByIdAndUpdate.mockResolvedValue(null)

    const app = createApp()
    const res = await request(app).patch('/api/atlas/epics/missing').send({ archived: true })

    expect(res.status).toBe(404)
  })

  it('passes an unexpected error to the error handler (500)', async () => {
    AtlasEpic.findByIdAndUpdate.mockRejectedValue(new Error('boom'))

    const app = createApp()
    const res = await request(app).patch('/api/atlas/epics/e1').send({ archived: true })

    expect(res.status).toBe(500)
  })
})

// Ticket 10: "Sync now" - re-runs trackAndSyncEpic for just the one epic
// (looked up by its Atlas _id, resolved to its jiraKey first) rather than
// requiring the caller to already know the jiraKey.
describe('POST /api/atlas/epics/:id/sync', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("resyncs the epic by its jiraKey and returns the fresh result", async () => {
    AtlasEpic.findById.mockResolvedValue({ _id: 'e1', jiraKey: 'WOSMVP-8262' })
    trackAndSyncEpic.mockResolvedValue({ epic: { _id: 'e1', jiraKey: 'WOSMVP-8262' }, tasks: [] })

    const app = createApp()
    const res = await request(app).post('/api/atlas/epics/e1/sync')

    expect(AtlasEpic.findById).toHaveBeenCalledWith('e1')
    expect(trackAndSyncEpic).toHaveBeenCalledWith('WOSMVP-8262')
    expect(res.status).toBe(200)
    expect(res.body.epic.jiraKey).toBe('WOSMVP-8262')
  })

  it('returns 404 when the epic id does not exist locally, without calling Jira', async () => {
    AtlasEpic.findById.mockResolvedValue(null)

    const app = createApp()
    const res = await request(app).post('/api/atlas/epics/missing/sync')

    expect(res.status).toBe(404)
    expect(trackAndSyncEpic).not.toHaveBeenCalled()
  })

  it('returns 404 when the epic has since been deleted/renamed away in Jira', async () => {
    AtlasEpic.findById.mockResolvedValue({ _id: 'e1', jiraKey: 'WOSMVP-8262' })
    trackAndSyncEpic.mockRejectedValue(new EpicNotFoundError('gone'))

    const app = createApp()
    const res = await request(app).post('/api/atlas/epics/e1/sync')

    expect(res.status).toBe(404)
  })

  it('passes an unexpected error to the error handler (500)', async () => {
    AtlasEpic.findById.mockResolvedValue({ _id: 'e1', jiraKey: 'WOSMVP-8262' })
    trackAndSyncEpic.mockRejectedValue(new Error('boom'))

    const app = createApp()
    const res = await request(app).post('/api/atlas/epics/e1/sync')

    expect(res.status).toBe(500)
  })

  it('resyncs every root ticket instead of calling trackAndSyncEpic, for the "Outside the program" epic', async () => {
    AtlasEpic.findById.mockResolvedValue({ _id: 'outside-epic', jiraKey: '__outside-program__', isOutsideProgram: true })
    AtlasTask.find
      .mockResolvedValueOnce([{ _id: 't1', jiraKey: 'WOSMVP-500' }, { _id: 't2', jiraKey: 'WOSMVP-600' }])
      .mockResolvedValueOnce([{ _id: 't1', jiraKey: 'WOSMVP-500' }, { _id: 't2', jiraKey: 'WOSMVP-600' }])
    trackAndSyncStandaloneTask.mockResolvedValue({ epic: {}, tasks: [] })

    const app = createApp()
    const res = await request(app).post('/api/atlas/epics/outside-epic/sync')

    expect(AtlasTask.find).toHaveBeenCalledWith({ epicId: 'outside-epic', parentTaskId: null, archived: false })
    expect(trackAndSyncStandaloneTask).toHaveBeenCalledWith('WOSMVP-500')
    expect(trackAndSyncStandaloneTask).toHaveBeenCalledWith('WOSMVP-600')
    expect(trackAndSyncEpic).not.toHaveBeenCalled()
    expect(res.status).toBe(200)
  })

  it("one root ticket's sync failure doesn't abort the rest, for the \"Outside the program\" epic", async () => {
    AtlasEpic.findById.mockResolvedValue({ _id: 'outside-epic', jiraKey: '__outside-program__', isOutsideProgram: true })
    AtlasTask.find
      .mockResolvedValueOnce([{ _id: 't1', jiraKey: 'WOSMVP-500' }, { _id: 't2', jiraKey: 'WOSMVP-600' }])
      .mockResolvedValueOnce([])
    trackAndSyncStandaloneTask.mockImplementation(async (jiraKey: string) => {
      if (jiraKey === 'WOSMVP-500') throw new Error('Jira request failed: 500')
      return { epic: {}, tasks: [] }
    })

    const app = createApp()
    const res = await request(app).post('/api/atlas/epics/outside-epic/sync')

    expect(res.status).toBe(200)
    expect(res.body.errors).toEqual([{ jiraKey: 'WOSMVP-500', error: 'Jira request failed: 500' }])
  })
})

describe('DELETE /api/atlas/epics/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('hard-deletes an archived epic and its tasks', async () => {
    AtlasEpic.findById.mockResolvedValue({ _id: 'e1', archived: true })

    const app = createApp()
    const res = await request(app).delete('/api/atlas/epics/e1')

    expect(AtlasTask.deleteMany).toHaveBeenCalledWith({ epicId: 'e1' })
    expect(AtlasEpic.findByIdAndDelete).toHaveBeenCalledWith('e1')
    expect(res.status).toBe(204)
  })

  it('refuses to delete an epic that is not archived', async () => {
    AtlasEpic.findById.mockResolvedValue({ _id: 'e1', archived: false })

    const app = createApp()
    const res = await request(app).delete('/api/atlas/epics/e1')

    expect(res.status).toBe(400)
    expect(AtlasTask.deleteMany).not.toHaveBeenCalled()
    expect(AtlasEpic.findByIdAndDelete).not.toHaveBeenCalled()
  })

  it('returns 404 when the epic does not exist', async () => {
    AtlasEpic.findById.mockResolvedValue(null)

    const app = createApp()
    const res = await request(app).delete('/api/atlas/epics/missing')

    expect(res.status).toBe(404)
    expect(AtlasTask.deleteMany).not.toHaveBeenCalled()
  })

  it('passes an unexpected error to the error handler (500)', async () => {
    AtlasEpic.findById.mockResolvedValue({ _id: 'e1', archived: true })
    AtlasTask.deleteMany.mockRejectedValue(new Error('boom'))

    const app = createApp()
    const res = await request(app).delete('/api/atlas/epics/e1')

    expect(res.status).toBe(500)
  })
})

// Ticket 10's global "sync all": loops every tracked, non-archived epic,
// never touching an archived one, and doesn't let one epic's failure abort
// the rest.
describe('POST /api/atlas/epics/sync-all', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('resyncs every tracked, non-archived epic and reports which succeeded', async () => {
    AtlasEpic.find.mockResolvedValue([
      { _id: 'e1', jiraKey: 'WOSMVP-1' },
      { _id: 'e2', jiraKey: 'WOSMVP-2' },
    ])
    AtlasEpic.findOne.mockResolvedValue(null)
    trackAndSyncEpic.mockResolvedValue({ epic: {}, tasks: [] })

    const app = createApp()
    const res = await request(app).post('/api/atlas/epics/sync-all')

    expect(AtlasEpic.find).toHaveBeenCalledWith({ archived: false, isOutsideProgram: { $ne: true } })
    expect(trackAndSyncEpic).toHaveBeenCalledWith('WOSMVP-1')
    expect(trackAndSyncEpic).toHaveBeenCalledWith('WOSMVP-2')
    expect(res.status).toBe(200)
    expect(res.body.synced).toEqual(['WOSMVP-1', 'WOSMVP-2'])
    expect(res.body.errors).toEqual([])
  })

  it('also resyncs every directly-tracked "Outside the program" root ticket', async () => {
    AtlasEpic.find.mockResolvedValue([])
    AtlasEpic.findOne.mockResolvedValue({ _id: 'outside-epic', isOutsideProgram: true })
    AtlasTask.find.mockResolvedValue([{ _id: 't1', jiraKey: 'WOSMVP-500' }])
    trackAndSyncStandaloneTask.mockResolvedValue({ epic: {}, tasks: [] })

    const app = createApp()
    const res = await request(app).post('/api/atlas/epics/sync-all')

    expect(AtlasEpic.findOne).toHaveBeenCalledWith({ isOutsideProgram: true, archived: false })
    expect(AtlasTask.find).toHaveBeenCalledWith({ epicId: 'outside-epic', parentTaskId: null, archived: false })
    expect(trackAndSyncStandaloneTask).toHaveBeenCalledWith('WOSMVP-500')
    expect(res.status).toBe(200)
    expect(res.body.synced).toEqual(['WOSMVP-500'])
  })

  it('does nothing extra when no "Outside the program" epic exists yet', async () => {
    AtlasEpic.find.mockResolvedValue([])
    AtlasEpic.findOne.mockResolvedValue(null)

    const app = createApp()
    const res = await request(app).post('/api/atlas/epics/sync-all')

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ synced: [], errors: [] })
    expect(trackAndSyncStandaloneTask).not.toHaveBeenCalled()
  })

  it("one epic's sync failure doesn't abort the rest, and is reported per-epic", async () => {
    AtlasEpic.find.mockResolvedValue([
      { _id: 'e1', jiraKey: 'WOSMVP-1' },
      { _id: 'e2', jiraKey: 'WOSMVP-2' },
    ])
    trackAndSyncEpic.mockImplementation(async (jiraKey: string) => {
      if (jiraKey === 'WOSMVP-1') throw new Error('Jira request failed: 500')
      return { epic: {}, tasks: [] }
    })

    const app = createApp()
    const res = await request(app).post('/api/atlas/epics/sync-all')

    expect(res.status).toBe(200)
    expect(res.body.synced).toEqual(['WOSMVP-2'])
    expect(res.body.errors).toEqual([{ jiraKey: 'WOSMVP-1', error: 'Jira request failed: 500' }])
  })

  it('does nothing and reports empty when no epics are tracked', async () => {
    AtlasEpic.find.mockResolvedValue([])

    const app = createApp()
    const res = await request(app).post('/api/atlas/epics/sync-all')

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ synced: [], errors: [] })
    expect(trackAndSyncEpic).not.toHaveBeenCalled()
  })
})
