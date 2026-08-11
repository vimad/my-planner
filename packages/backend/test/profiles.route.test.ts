import request from 'supertest'
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'

// The mocked shape mirrors the vi.mock factories below, not the real
// mongoose.Model<...> types — these are plain vi.fn() stubs at runtime, so
// typing them as Mock (rather than fighting Mongoose's real static-method
// overloads) is the honest contract here, same as categories.route.test.ts.
interface MockedProfileModel {
  find: Mock
  create: Mock
  findById: Mock
  findByIdAndUpdate: Mock
  findByIdAndDelete: Mock
  findOne: Mock
  countDocuments: Mock
}

interface MockedCategoryModel {
  find: Mock
  create: Mock
  findOne: Mock
  deleteMany: Mock
}

interface MockedScratchNoteModel {
  deleteMany: Mock
}

interface MockedTodoModel {
  deleteMany: Mock
}

vi.mock('../src/models/Profile.ts', () => {
  return {
    Profile: {
      find: vi.fn(),
      create: vi.fn(),
      findById: vi.fn(),
      findByIdAndUpdate: vi.fn(),
      findByIdAndDelete: vi.fn(),
      findOne: vi.fn(),
      countDocuments: vi.fn(),
    },
  }
})

vi.mock('../src/models/Category.ts', () => {
  return {
    Category: {
      find: vi.fn(),
      create: vi.fn(),
      findOne: vi.fn(),
      deleteMany: vi.fn(),
    },
  }
})

vi.mock('../src/models/ScratchNote.ts', () => {
  return {
    ScratchNote: {
      deleteMany: vi.fn(),
    },
  }
})

vi.mock('../src/models/Todo.ts', () => {
  return {
    Todo: {
      deleteMany: vi.fn(),
    },
  }
})

const { Profile } = (await import('../src/models/Profile.ts')) as unknown as {
  Profile: MockedProfileModel
}
const { Category } = (await import('../src/models/Category.ts')) as unknown as {
  Category: MockedCategoryModel
}
const { ScratchNote } = (await import('../src/models/ScratchNote.ts')) as unknown as {
  ScratchNote: MockedScratchNoteModel
}
const { Todo } = (await import('../src/models/Todo.ts')) as unknown as {
  Todo: MockedTodoModel
}
const { createApp } = await import('../src/app.ts')

describe('Profile routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('POST /api/profiles', () => {
    it('creates a profile and seeds its own Uncategorized category', async () => {
      Profile.create.mockResolvedValue({ _id: 'p1', name: 'Personal', color: '#4361ee' })
      Category.findOne.mockResolvedValue(null)
      Category.create.mockResolvedValue({ _id: 'c1', name: 'Uncategorized', profileId: 'p1' })

      const app = createApp()
      const res = await request(app)
        .post('/api/profiles')
        .send({ name: 'Personal', color: '#4361ee' })

      expect(res.status).toBe(201)
      expect(res.body).toEqual({ _id: 'p1', name: 'Personal', color: '#4361ee' })
      expect(Profile.create).toHaveBeenCalledWith({ name: 'Personal', color: '#4361ee' })
      expect(Category.findOne).toHaveBeenCalledWith({ name: 'Uncategorized', profileId: 'p1' })
      expect(Category.create).toHaveBeenCalledWith({
        name: 'Uncategorized',
        color: '#94a3b8',
        system: true,
        profileId: 'p1',
      })
    })

    it('rejects a missing name', async () => {
      const app = createApp()
      const res = await request(app).post('/api/profiles').send({ color: '#4361ee' })

      expect(res.status).toBe(400)
      expect(Profile.create).not.toHaveBeenCalled()
    })
  })

  describe('GET /api/profiles', () => {
    it('lists all profiles', async () => {
      const docs = [
        { _id: 'p1', name: 'Work', color: '#4361ee' },
        { _id: 'p2', name: 'Personal', color: '#2a9d8f' },
      ]
      Profile.find.mockReturnValue({ sort: vi.fn().mockResolvedValue(docs) })

      const app = createApp()
      const res = await request(app).get('/api/profiles')

      expect(res.status).toBe(200)
      expect(res.body).toEqual(docs)
    })
  })

  describe('PATCH /api/profiles/:id', () => {
    it('renames a profile', async () => {
      Profile.findByIdAndUpdate.mockResolvedValue({ _id: 'p1', name: 'Deep Work', color: '#4361ee' })

      const app = createApp()
      const res = await request(app).patch('/api/profiles/p1').send({ name: 'Deep Work' })

      expect(res.status).toBe(200)
      expect(res.body.name).toBe('Deep Work')
      expect(Profile.findByIdAndUpdate).toHaveBeenCalledWith('p1', { name: 'Deep Work' }, { returnDocument: 'after' })
    })

    it('returns 404 when the profile does not exist', async () => {
      Profile.findByIdAndUpdate.mockResolvedValue(null)

      const app = createApp()
      const res = await request(app).patch('/api/profiles/does-not-exist').send({ name: 'x' })

      expect(res.status).toBe(404)
    })

    it('switches the active board (client sends activeBoardId from the Boards-view switcher)', async () => {
      Profile.findByIdAndUpdate.mockResolvedValue({ _id: 'p1', name: 'Work', activeBoardId: 'b2' })

      const app = createApp()
      const res = await request(app).patch('/api/profiles/p1').send({ activeBoardId: 'b2' })

      expect(res.status).toBe(200)
      expect(res.body.activeBoardId).toBe('b2')
      expect(Profile.findByIdAndUpdate).toHaveBeenCalledWith('p1', { activeBoardId: 'b2' }, { returnDocument: 'after' })
    })

    it('clears the active board via activeBoardId: null', async () => {
      Profile.findByIdAndUpdate.mockResolvedValue({ _id: 'p1', name: 'Work', activeBoardId: null })

      const app = createApp()
      const res = await request(app).patch('/api/profiles/p1').send({ activeBoardId: null })

      expect(res.status).toBe(200)
      expect(res.body.activeBoardId).toBeNull()
      expect(Profile.findByIdAndUpdate).toHaveBeenCalledWith('p1', { activeBoardId: null }, { returnDocument: 'after' })
    })
  })

  describe('DELETE /api/profiles/:id', () => {
    it('cascade-deletes a non-last profile: its Categories, their Todos, and its ScratchNotes', async () => {
      Profile.findById.mockResolvedValue({ _id: 'p2', name: 'Personal' })
      Profile.countDocuments.mockResolvedValue(2)
      Category.find.mockResolvedValue([{ _id: 'c1' }, { _id: 'c2' }])
      Todo.deleteMany.mockResolvedValue({ deletedCount: 3 })
      Category.deleteMany.mockResolvedValue({ deletedCount: 2 })
      ScratchNote.deleteMany.mockResolvedValue({ deletedCount: 1 })
      Profile.findByIdAndDelete.mockResolvedValue({ _id: 'p2' })

      const app = createApp()
      const res = await request(app).delete('/api/profiles/p2')

      expect(res.status).toBe(204)
      expect(Category.find).toHaveBeenCalledWith({ profileId: 'p2' })
      expect(Todo.deleteMany).toHaveBeenCalledWith({ categoryId: { $in: ['c1', 'c2'] } })
      expect(Category.deleteMany).toHaveBeenCalledWith({ profileId: 'p2' })
      expect(ScratchNote.deleteMany).toHaveBeenCalledWith({ profileId: 'p2' })
      expect(Profile.findByIdAndDelete).toHaveBeenCalledWith('p2')
    })

    it('rejects deleting the only remaining profile', async () => {
      Profile.findById.mockResolvedValue({ _id: 'p1', name: 'Work' })
      Profile.countDocuments.mockResolvedValue(1)

      const app = createApp()
      const res = await request(app).delete('/api/profiles/p1')

      expect(res.status).toBe(400)
      expect(Profile.findByIdAndDelete).not.toHaveBeenCalled()
      expect(Category.deleteMany).not.toHaveBeenCalled()
    })

    it('returns 404 when the profile does not exist', async () => {
      Profile.findById.mockResolvedValue(null)

      const app = createApp()
      const res = await request(app).delete('/api/profiles/does-not-exist')

      expect(res.status).toBe(404)
    })
  })
})
