import request from 'supertest'
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'

// The mocked shape mirrors the vi.mock factory below, not the real
// mongoose.Model<CategoryDoc> type — these are plain vi.fn() stubs at
// runtime, so typing them as Mock (rather than fighting Mongoose's real
// static-method overloads) is the honest contract here.
interface MockedCategoryModel {
  find: Mock
  create: Mock
  findById: Mock
  findByIdAndUpdate: Mock
  findByIdAndDelete: Mock
  findOne: Mock
}

vi.mock('../src/models/Category.ts', () => {
  return {
    Category: {
      find: vi.fn(),
      create: vi.fn(),
      findById: vi.fn(),
      findByIdAndUpdate: vi.fn(),
      findByIdAndDelete: vi.fn(),
      findOne: vi.fn(),
    },
  }
})

const { Category } = (await import('../src/models/Category.ts')) as unknown as {
  Category: MockedCategoryModel
}
const { createApp } = await import('../src/app.ts')

describe('Category routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('POST /api/categories', () => {
    it('creates a category', async () => {
      Category.create.mockResolvedValue({
        _id: '1',
        name: 'Work',
        color: '#4361ee',
      })

      const app = createApp()
      const res = await request(app)
        .post('/api/categories')
        .send({ name: 'Work', color: '#4361ee' })

      expect(res.status).toBe(201)
      expect(res.body).toEqual({ _id: '1', name: 'Work', color: '#4361ee' })
      expect(Category.create).toHaveBeenCalledWith({ name: 'Work', color: '#4361ee' })
    })

    it('rejects a missing name or color', async () => {
      const app = createApp()
      const res = await request(app).post('/api/categories').send({ name: 'Work' })

      expect(res.status).toBe(400)
      expect(Category.create).not.toHaveBeenCalled()
    })
  })

  describe('GET /api/categories', () => {
    it('lists categories annotated with remaining/completed counts', async () => {
      const docs = [
        {
          _id: '1',
          toObject: () => ({ _id: '1', name: 'Uncategorized', color: '#94a3b8', system: true }),
        },
        {
          _id: '2',
          toObject: () => ({ _id: '2', name: 'Work', color: '#4361ee', system: false }),
        },
      ]
      Category.find.mockReturnValue({ sort: vi.fn().mockResolvedValue(docs) })

      const app = createApp()
      const res = await request(app).get('/api/categories')

      expect(res.status).toBe(200)
      expect(res.body).toEqual([
        { _id: '1', name: 'Uncategorized', color: '#94a3b8', system: true, remaining: 0, completed: 0 },
        { _id: '2', name: 'Work', color: '#4361ee', system: false, remaining: 0, completed: 0 },
      ])
    })
  })

  describe('PATCH /api/categories/:id', () => {
    it('renames a category', async () => {
      Category.findByIdAndUpdate.mockResolvedValue({
        _id: '2',
        name: 'Deep Work',
        color: '#4361ee',
      })

      const app = createApp()
      const res = await request(app)
        .patch('/api/categories/2')
        .send({ name: 'Deep Work' })

      expect(res.status).toBe(200)
      expect(res.body.name).toBe('Deep Work')
      expect(Category.findByIdAndUpdate).toHaveBeenCalledWith(
        '2',
        { name: 'Deep Work' },
        { new: true },
      )
    })

    it('returns 404 when the category does not exist', async () => {
      Category.findByIdAndUpdate.mockResolvedValue(null)

      const app = createApp()
      const res = await request(app).patch('/api/categories/does-not-exist').send({ name: 'x' })

      expect(res.status).toBe(404)
    })
  })

  describe('DELETE /api/categories/:id', () => {
    it('deletes a user-created category', async () => {
      Category.findById.mockResolvedValue({ _id: '2', name: 'Work', system: false })
      Category.findByIdAndDelete.mockResolvedValue({ _id: '2' })

      const app = createApp()
      const res = await request(app).delete('/api/categories/2')

      expect(res.status).toBe(204)
      expect(Category.findByIdAndDelete).toHaveBeenCalledWith('2')
    })

    it('rejects deleting the system Uncategorized category', async () => {
      Category.findById.mockResolvedValue({
        _id: '1',
        name: 'Uncategorized',
        system: true,
      })

      const app = createApp()
      const res = await request(app).delete('/api/categories/1')

      expect(res.status).toBe(400)
      expect(Category.findByIdAndDelete).not.toHaveBeenCalled()
    })

    it('returns 404 when the category does not exist', async () => {
      Category.findById.mockResolvedValue(null)

      const app = createApp()
      const res = await request(app).delete('/api/categories/does-not-exist')

      expect(res.status).toBe(404)
    })
  })
})
