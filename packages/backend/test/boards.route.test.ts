import request from 'supertest'
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'

// The mocked shape mirrors the vi.mock factories below, not the real
// mongoose.Model<...> types — these are plain vi.fn() stubs at runtime, so
// typing them as Mock (rather than fighting Mongoose's real static-method
// overloads) is the honest contract here, same as categories.route.test.ts.
interface MockedBoardModel {
  find: Mock
  findOne: Mock
  create: Mock
  findOneAndUpdate: Mock
  findByIdAndDelete: Mock
}

interface MockedProfileModel {
  findById: Mock
}

interface MockedTodoModel {
  deleteMany: Mock
  findByIdAndDelete: Mock
}

interface MockedNoteModel {
  deleteMany: Mock
  findByIdAndDelete: Mock
}

vi.mock('../src/models/Board.ts', () => {
  return {
    Board: {
      find: vi.fn(),
      findOne: vi.fn(),
      create: vi.fn(),
      findOneAndUpdate: vi.fn(),
      findByIdAndDelete: vi.fn(),
    },
  }
})

vi.mock('../src/models/Profile.ts', () => {
  return {
    Profile: {
      findById: vi.fn(),
    },
  }
})

// Board routes deliberately never import/touch Todo or Note (see the
// no-cascade comment on Board.items in models/Board.ts) — mocked here purely
// so the no-cascade tests below can assert these stay untouched by any
// board mutation.
vi.mock('../src/models/Todo.ts', () => {
  return {
    Todo: {
      deleteMany: vi.fn(),
      findByIdAndDelete: vi.fn(),
    },
  }
})

vi.mock('../src/models/Note.ts', () => {
  return {
    Note: {
      deleteMany: vi.fn(),
      findByIdAndDelete: vi.fn(),
    },
  }
})

const { Board } = (await import('../src/models/Board.ts')) as unknown as {
  Board: MockedBoardModel
}
const { Profile } = (await import('../src/models/Profile.ts')) as unknown as {
  Profile: MockedProfileModel
}
const { Todo } = (await import('../src/models/Todo.ts')) as unknown as {
  Todo: MockedTodoModel
}
const { Note } = (await import('../src/models/Note.ts')) as unknown as {
  Note: MockedNoteModel
}
const { createApp } = await import('../src/app.ts')

describe('Board routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('POST /api/boards', () => {
    it('creates an empty board attached to the given profileId', async () => {
      Board.create.mockResolvedValue({ _id: 'b1', name: 'Kitchen Remodel', profileId: 'p1', items: [] })

      const app = createApp()
      const res = await request(app).post('/api/boards').send({ name: 'Kitchen Remodel', profileId: 'p1' })

      expect(res.status).toBe(201)
      expect(res.body).toEqual({ _id: 'b1', name: 'Kitchen Remodel', profileId: 'p1', items: [] })
      expect(Board.create).toHaveBeenCalledWith({ name: 'Kitchen Remodel', profileId: 'p1' })
    })

    it('rejects a missing name', async () => {
      const app = createApp()
      const res = await request(app).post('/api/boards').send({ profileId: 'p1' })

      expect(res.status).toBe(400)
      expect(Board.create).not.toHaveBeenCalled()
    })

    it('rejects a missing profileId', async () => {
      const app = createApp()
      const res = await request(app).post('/api/boards').send({ name: 'Kitchen Remodel' })

      expect(res.status).toBe(400)
      expect(res.body).toEqual({ error: 'profileId is required' })
      expect(Board.create).not.toHaveBeenCalled()
    })
  })

  describe('GET /api/boards', () => {
    it("lists a profile's boards, items embedded, in creation order", async () => {
      const docs = [
        { _id: 'b1', name: 'Kitchen Remodel', profileId: 'p1', items: [{ itemType: 'Todo', itemId: 't1' }] },
        { _id: 'b2', name: "Today's 1:1", profileId: 'p1', items: [] },
      ]
      Board.find.mockReturnValue({ sort: vi.fn().mockResolvedValue(docs) })

      const app = createApp()
      const res = await request(app).get('/api/boards').query({ profileId: 'p1' })

      expect(res.status).toBe(200)
      expect(Board.find).toHaveBeenCalledWith({ profileId: 'p1' })
      expect(res.body).toEqual(docs)
    })

    it('rejects a missing profileId', async () => {
      const app = createApp()
      const res = await request(app).get('/api/boards')

      expect(res.status).toBe(400)
      expect(res.body).toEqual({ error: 'profileId is required' })
      expect(Board.find).not.toHaveBeenCalled()
    })

    it("never returns another profile's boards", async () => {
      Board.find.mockReturnValue({ sort: vi.fn().mockResolvedValue([]) })

      const app = createApp()
      const resA = await request(app).get('/api/boards').query({ profileId: 'profile-a' })
      const resB = await request(app).get('/api/boards').query({ profileId: 'profile-b' })

      expect(resA.status).toBe(200)
      expect(resB.status).toBe(200)
      expect(Board.find).toHaveBeenNthCalledWith(1, { profileId: 'profile-a' })
      expect(Board.find).toHaveBeenNthCalledWith(2, { profileId: 'profile-b' })
    })

    it('leaves a dangling item entry in place when its underlying todo/note has since been deleted elsewhere', async () => {
      // Board never validates itemId against Todo/Note on read - a since-
      // deleted reference is returned as-is (frontend renders it as a
      // ghost-card placeholder); the schema/route layer does no cleanup.
      const docs = [
        {
          _id: 'b1',
          name: 'Kitchen Remodel',
          profileId: 'p1',
          items: [{ itemType: 'Todo', itemId: 'deleted-todo-id' }],
        },
      ]
      Board.find.mockReturnValue({ sort: vi.fn().mockResolvedValue(docs) })

      const app = createApp()
      const res = await request(app).get('/api/boards').query({ profileId: 'p1' })

      expect(res.status).toBe(200)
      expect(res.body).toEqual(docs)
    })
  })

  describe('PATCH /api/boards/:id', () => {
    it('renames a board', async () => {
      Board.findOneAndUpdate.mockResolvedValue({ _id: 'b1', name: 'New Name', items: [] })

      const app = createApp()
      const res = await request(app).patch('/api/boards/b1').query({ profileId: 'p1' }).send({ name: 'New Name' })

      expect(res.status).toBe(200)
      expect(res.body.name).toBe('New Name')
      expect(Board.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: 'b1', profileId: 'p1' },
        { name: 'New Name' },
        { new: true },
      )
    })

    it('replaces the whole items array (covers add/remove/reorder in one PATCH)', async () => {
      const newItems = [
        { itemType: 'Note', itemId: 'n1' },
        { itemType: 'Todo', itemId: 't1' },
      ]
      Board.findOneAndUpdate.mockResolvedValue({ _id: 'b1', name: 'Kitchen Remodel', items: newItems })

      const app = createApp()
      const res = await request(app).patch('/api/boards/b1').query({ profileId: 'p1' }).send({ items: newItems })

      expect(res.status).toBe(200)
      expect(res.body.items).toEqual(newItems)
      expect(Board.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: 'b1', profileId: 'p1' },
        { items: newItems },
        { new: true },
      )
    })

    it('updates name and items together in one PATCH', async () => {
      const items = [{ itemType: 'Todo', itemId: 't1' }]
      Board.findOneAndUpdate.mockResolvedValue({ _id: 'b1', name: 'Renamed', items })

      const app = createApp()
      const res = await request(app)
        .patch('/api/boards/b1')
        .query({ profileId: 'p1' })
        .send({ name: 'Renamed', items })

      expect(res.status).toBe(200)
      expect(Board.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: 'b1', profileId: 'p1' },
        { name: 'Renamed', items },
        { new: true },
      )
    })

    it('rejects a missing profileId', async () => {
      const app = createApp()
      const res = await request(app).patch('/api/boards/b1').send({ name: 'x' })

      expect(res.status).toBe(400)
      expect(Board.findOneAndUpdate).not.toHaveBeenCalled()
    })

    it('returns 404 when the board does not exist', async () => {
      Board.findOneAndUpdate.mockResolvedValue(null)

      const app = createApp()
      const res = await request(app)
        .patch('/api/boards/does-not-exist')
        .query({ profileId: 'p1' })
        .send({ name: 'x' })

      expect(res.status).toBe(404)
    })

    it('returns 404 when the board belongs to a different profile', async () => {
      Board.findOneAndUpdate.mockResolvedValue(null)

      const app = createApp()
      const res = await request(app)
        .patch('/api/boards/b1')
        .query({ profileId: 'profile-b' })
        .send({ name: 'Hijacked' })

      expect(res.status).toBe(404)
      expect(Board.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: 'b1', profileId: 'profile-b' },
        { name: 'Hijacked' },
        { new: true },
      )
    })
  })

  describe('DELETE /api/boards/:id', () => {
    it('deletes only the board itself — the todos/notes it referenced are never touched', async () => {
      Board.findOne.mockResolvedValue({
        _id: 'b1',
        name: 'Kitchen Remodel',
        profileId: 'p1',
        items: [
          { itemType: 'Todo', itemId: 't1' },
          { itemType: 'Note', itemId: 'n1' },
        ],
      })
      Board.findByIdAndDelete.mockResolvedValue({ _id: 'b1' })
      Profile.findById.mockResolvedValue({ _id: 'p1', activeBoardId: null, save: vi.fn() })

      const app = createApp()
      const res = await request(app).delete('/api/boards/b1').query({ profileId: 'p1' })

      expect(res.status).toBe(204)
      expect(Board.findByIdAndDelete).toHaveBeenCalledWith('b1')
      expect(Todo.deleteMany).not.toHaveBeenCalled()
      expect(Todo.findByIdAndDelete).not.toHaveBeenCalled()
      expect(Note.deleteMany).not.toHaveBeenCalled()
      expect(Note.findByIdAndDelete).not.toHaveBeenCalled()
    })

    it('deletes a board without touching Profile.activeBoardId when it was not active', async () => {
      Board.findOne.mockResolvedValue({ _id: 'b2', name: 'Other Board', profileId: 'p1' })
      Board.findByIdAndDelete.mockResolvedValue({ _id: 'b2' })
      Profile.findById.mockResolvedValue({ _id: 'p1', activeBoardId: 'b1', save: vi.fn() })

      const app = createApp()
      const res = await request(app).delete('/api/boards/b2').query({ profileId: 'p1' })

      expect(res.status).toBe(204)
      expect(Board.findOne).toHaveBeenCalledWith({ _id: 'b2', profileId: 'p1' })
      expect(Board.findByIdAndDelete).toHaveBeenCalledWith('b2')
      const profileDoc = await Profile.findById.mock.results[0]?.value
      expect(profileDoc.save).not.toHaveBeenCalled()
    })

    it('falls back Profile.activeBoardId to the next board in creation order when the active board is deleted', async () => {
      Board.findOne.mockResolvedValue({ _id: 'b1', name: 'Kitchen Remodel', profileId: 'p1' })
      Board.findByIdAndDelete.mockResolvedValue({ _id: 'b1' })
      const save = vi.fn()
      const profileDoc = { _id: 'p1', activeBoardId: 'b1', save }
      Profile.findById.mockResolvedValue(profileDoc)
      // findOne is called twice by the route: once for the ownership check
      // ({_id, profileId}), once for the "next board" lookup ({profileId}
      // only, chained with .sort()) — branch on whether _id is present.
      const nextBoard = { _id: 'b2', name: "Today's 1:1" }
      Board.findOne.mockImplementation(({ _id }: { _id?: string; profileId: string }) => {
        if (_id) return Promise.resolve({ _id: 'b1', name: 'Kitchen Remodel', profileId: 'p1' })
        return { sort: vi.fn().mockResolvedValue(nextBoard) }
      })

      const app = createApp()
      const res = await request(app).delete('/api/boards/b1').query({ profileId: 'p1' })

      expect(res.status).toBe(204)
      expect(profileDoc.activeBoardId).toBe(nextBoard._id)
      expect(save).toHaveBeenCalled()
    })

    it('falls back Profile.activeBoardId to null when no boards remain', async () => {
      const save = vi.fn()
      const profileDoc = { _id: 'p1', activeBoardId: 'b1', save }
      Profile.findById.mockResolvedValue(profileDoc)
      Board.findOne.mockImplementation(({ _id }: { _id?: string; profileId: string }) => {
        if (_id) return Promise.resolve({ _id: 'b1', name: 'Kitchen Remodel', profileId: 'p1' })
        return { sort: vi.fn().mockResolvedValue(null) }
      })
      Board.findByIdAndDelete.mockResolvedValue({ _id: 'b1' })

      const app = createApp()
      const res = await request(app).delete('/api/boards/b1').query({ profileId: 'p1' })

      expect(res.status).toBe(204)
      expect(profileDoc.activeBoardId).toBeNull()
      expect(save).toHaveBeenCalled()
    })

    it('rejects a missing profileId', async () => {
      const app = createApp()
      const res = await request(app).delete('/api/boards/b1')

      expect(res.status).toBe(400)
      expect(Board.findOne).not.toHaveBeenCalled()
    })

    it('returns 404 when the board does not exist', async () => {
      Board.findOne.mockResolvedValue(null)

      const app = createApp()
      const res = await request(app).delete('/api/boards/does-not-exist').query({ profileId: 'p1' })

      expect(res.status).toBe(404)
    })

    it('returns 404 when the board belongs to a different profile (no cross-profile delete)', async () => {
      Board.findOne.mockResolvedValue(null)

      const app = createApp()
      const res = await request(app).delete('/api/boards/b1').query({ profileId: 'profile-b' })

      expect(res.status).toBe(404)
      expect(Board.findOne).toHaveBeenCalledWith({ _id: 'b1', profileId: 'profile-b' })
      expect(Board.findByIdAndDelete).not.toHaveBeenCalled()
    })
  })
})
