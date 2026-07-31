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
  findOneAndUpdate: Mock
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
      findOneAndUpdate: vi.fn(),
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
    it('creates a category attached to the given profileId', async () => {
      Category.create.mockResolvedValue({
        _id: '1',
        name: 'Work',
        color: '#4361ee',
        profileId: 'p1',
      })

      const app = createApp()
      const res = await request(app)
        .post('/api/categories')
        .send({ name: 'Work', color: '#4361ee', profileId: 'p1' })

      expect(res.status).toBe(201)
      expect(res.body).toEqual({ _id: '1', name: 'Work', color: '#4361ee', profileId: 'p1' })
      expect(Category.create).toHaveBeenCalledWith({ name: 'Work', color: '#4361ee', profileId: 'p1' })
    })

    it('rejects a missing name or color', async () => {
      const app = createApp()
      const res = await request(app).post('/api/categories').send({ name: 'Work', profileId: 'p1' })

      expect(res.status).toBe(400)
      expect(Category.create).not.toHaveBeenCalled()
    })

    it('rejects a missing profileId', async () => {
      const app = createApp()
      const res = await request(app).post('/api/categories').send({ name: 'Work', color: '#4361ee' })

      expect(res.status).toBe(400)
      expect(res.body).toEqual({ error: 'profileId is required' })
      expect(Category.create).not.toHaveBeenCalled()
    })
  })

  describe('GET /api/categories', () => {
    it('lists a profile\'s categories annotated with remaining/completed counts', async () => {
      const docs = [
        {
          _id: '1',
          toObject: () => ({ _id: '1', name: 'Uncategorized', color: '#94a3b8', system: true, profileId: 'p1' }),
        },
        {
          _id: '2',
          toObject: () => ({ _id: '2', name: 'Work', color: '#4361ee', system: false, profileId: 'p1' }),
        },
      ]
      Category.find.mockReturnValue({ sort: vi.fn().mockResolvedValue(docs) })

      const app = createApp()
      const res = await request(app).get('/api/categories').query({ profileId: 'p1' })

      expect(res.status).toBe(200)
      expect(Category.find).toHaveBeenCalledWith({ profileId: 'p1' })
      expect(res.body).toEqual([
        { _id: '1', name: 'Uncategorized', color: '#94a3b8', system: true, profileId: 'p1', remaining: 0, completed: 0 },
        { _id: '2', name: 'Work', color: '#4361ee', system: false, profileId: 'p1', remaining: 0, completed: 0 },
      ])
    })

    it('rejects a missing profileId', async () => {
      const app = createApp()
      const res = await request(app).get('/api/categories')

      expect(res.status).toBe(400)
      expect(res.body).toEqual({ error: 'profileId is required' })
      expect(Category.find).not.toHaveBeenCalled()
    })

    it('never returns another profile\'s categories', async () => {
      // Category.find is mocked at the model boundary — the assertion below
      // checks the route passed the *right* filter to it, which is this
      // route's actual scoping contract; Mongoose itself (untested here) is
      // responsible for honestly filtering by whatever query it's given.
      Category.find.mockReturnValue({ sort: vi.fn().mockResolvedValue([]) })

      const app = createApp()
      const resA = await request(app).get('/api/categories').query({ profileId: 'profile-a' })
      const resB = await request(app).get('/api/categories').query({ profileId: 'profile-b' })

      expect(resA.status).toBe(200)
      expect(resB.status).toBe(200)
      expect(Category.find).toHaveBeenNthCalledWith(1, { profileId: 'profile-a' })
      expect(Category.find).toHaveBeenNthCalledWith(2, { profileId: 'profile-b' })
    })
  })

  describe('PATCH /api/categories/:id', () => {
    it('renames a category', async () => {
      Category.findOneAndUpdate.mockResolvedValue({
        _id: '2',
        name: 'Deep Work',
        color: '#4361ee',
      })

      const app = createApp()
      const res = await request(app)
        .patch('/api/categories/2')
        .query({ profileId: 'p1' })
        .send({ name: 'Deep Work' })

      expect(res.status).toBe(200)
      expect(res.body.name).toBe('Deep Work')
      expect(Category.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: '2', profileId: 'p1' },
        { name: 'Deep Work' },
        { new: true },
      )
    })

    it('rejects a missing profileId', async () => {
      const app = createApp()
      const res = await request(app).patch('/api/categories/2').send({ name: 'x' })

      expect(res.status).toBe(400)
      expect(Category.findOneAndUpdate).not.toHaveBeenCalled()
    })

    it('returns 404 when the category does not exist', async () => {
      Category.findOneAndUpdate.mockResolvedValue(null)

      const app = createApp()
      const res = await request(app)
        .patch('/api/categories/does-not-exist')
        .query({ profileId: 'p1' })
        .send({ name: 'x' })

      expect(res.status).toBe(404)
    })

    it('returns 404 when the category belongs to a different profile', async () => {
      // Mongoose (untested here) is what actually honours the {_id, profileId}
      // filter - this asserts the route passes the right filter to it.
      Category.findOneAndUpdate.mockResolvedValue(null)

      const app = createApp()
      const res = await request(app)
        .patch('/api/categories/2')
        .query({ profileId: 'profile-b' })
        .send({ name: 'Hijacked' })

      expect(res.status).toBe(404)
      expect(Category.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: '2', profileId: 'profile-b' },
        { name: 'Hijacked' },
        { new: true },
      )
    })
  })

  describe('DELETE /api/categories/:id', () => {
    it('deletes a user-created category', async () => {
      Category.findOne.mockResolvedValue({ _id: '2', name: 'Work', system: false })
      Category.findByIdAndDelete.mockResolvedValue({ _id: '2' })

      const app = createApp()
      const res = await request(app).delete('/api/categories/2').query({ profileId: 'p1' })

      expect(res.status).toBe(204)
      expect(Category.findOne).toHaveBeenCalledWith({ _id: '2', profileId: 'p1' })
      expect(Category.findByIdAndDelete).toHaveBeenCalledWith('2')
    })

    it('rejects deleting the system Uncategorized category', async () => {
      Category.findOne.mockResolvedValue({
        _id: '1',
        name: 'Uncategorized',
        system: true,
      })

      const app = createApp()
      const res = await request(app).delete('/api/categories/1').query({ profileId: 'p1' })

      expect(res.status).toBe(400)
      expect(Category.findByIdAndDelete).not.toHaveBeenCalled()
    })

    it('rejects a missing profileId', async () => {
      const app = createApp()
      const res = await request(app).delete('/api/categories/2')

      expect(res.status).toBe(400)
      expect(Category.findOne).not.toHaveBeenCalled()
    })

    it('returns 404 when the category does not exist', async () => {
      Category.findOne.mockResolvedValue(null)

      const app = createApp()
      const res = await request(app).delete('/api/categories/does-not-exist').query({ profileId: 'p1' })

      expect(res.status).toBe(404)
    })

    it('returns 404 when the category belongs to a different profile', async () => {
      Category.findOne.mockResolvedValue(null)

      const app = createApp()
      const res = await request(app).delete('/api/categories/2').query({ profileId: 'profile-b' })

      expect(res.status).toBe(404)
      expect(Category.findOne).toHaveBeenCalledWith({ _id: '2', profileId: 'profile-b' })
      expect(Category.findByIdAndDelete).not.toHaveBeenCalled()
    })
  })
})
