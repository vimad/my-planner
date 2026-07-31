import request from 'supertest'
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'

interface MockedTodoModel {
  find: Mock
  create: Mock
  findById: Mock
  findByIdAndDelete: Mock
  findByIdAndUpdate: Mock
  distinct: Mock
}

interface MockedCategoryModel {
  findOne: Mock
  find: Mock
}

vi.mock('../src/models/Todo.ts', () => {
  return {
    Todo: {
      find: vi.fn(),
      create: vi.fn(),
      findById: vi.fn(),
      findByIdAndDelete: vi.fn(),
      findByIdAndUpdate: vi.fn(),
      distinct: vi.fn(),
    },
  }
})

vi.mock('../src/models/Category.ts', () => {
  return {
    Category: {
      findOne: vi.fn(),
      find: vi.fn(),
    },
  }
})

const { Todo } = (await import('../src/models/Todo.ts')) as unknown as {
  Todo: MockedTodoModel
}
const { Category } = (await import('../src/models/Category.ts')) as unknown as {
  Category: MockedCategoryModel
}
const { createApp } = await import('../src/app.ts')

describe('Todo routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Default: resolveCategoryIdsForProfile's Category.find() call resolves
    // to no categories unless a test overrides it — most GET tests below
    // only care about the Todo.find/.distinct filter shape it feeds into,
    // not the specific category ids.
    Category.find.mockResolvedValue([])
  })

  describe('POST /api/todos', () => {
    it('quick-creates a todo from just a title, defaulting to the active profile\'s Uncategorized category', async () => {
      Category.findOne.mockResolvedValue({ _id: 'uncategorized-id', name: 'Uncategorized' })
      Todo.create.mockResolvedValue({
        _id: 't1',
        title: 'Buy milk',
        categoryId: 'uncategorized-id',
        completed: false,
        dueDate: null,
      })

      const app = createApp()
      const res = await request(app).post('/api/todos').send({ title: 'Buy milk', profileId: 'profile-1' })

      expect(res.status).toBe(201)
      expect(Category.findOne).toHaveBeenCalledWith({ name: 'Uncategorized', profileId: 'profile-1' })
      expect(Todo.create).toHaveBeenCalledWith({
        title: 'Buy milk',
        categoryId: 'uncategorized-id',
        dueDate: null,
      })
    })

    it('rejects when neither categoryId nor profileId is provided', async () => {
      const app = createApp()
      const res = await request(app).post('/api/todos').send({ title: 'Buy milk' })

      expect(res.status).toBe(400)
      expect(res.body).toEqual({ error: 'profileId is required when no categoryId is provided' })
      expect(Category.findOne).not.toHaveBeenCalled()
      expect(Todo.create).not.toHaveBeenCalled()
    })

    it("defaults to a different profile's own Uncategorized category when a different profileId is supplied", async () => {
      Category.findOne.mockResolvedValue({ _id: 'other-uncategorized-id', name: 'Uncategorized' })
      Todo.create.mockResolvedValue({
        _id: 't1b',
        title: 'Water the plants',
        categoryId: 'other-uncategorized-id',
        completed: false,
        dueDate: null,
      })

      const app = createApp()
      const res = await request(app)
        .post('/api/todos')
        .send({ title: 'Water the plants', profileId: 'profile-2' })

      expect(res.status).toBe(201)
      expect(Category.findOne).toHaveBeenCalledWith({ name: 'Uncategorized', profileId: 'profile-2' })
      expect(Todo.create).toHaveBeenCalledWith({
        title: 'Water the plants',
        categoryId: 'other-uncategorized-id',
        dueDate: null,
      })
    })

    it('uses a provided categoryId and dueDate without looking up Uncategorized', async () => {
      Todo.create.mockResolvedValue({
        _id: 't2',
        title: 'Ship feature',
        categoryId: 'work-id',
        dueDate: '2026-07-25',
        completed: false,
      })

      const app = createApp()
      const res = await request(app)
        .post('/api/todos')
        .send({ title: 'Ship feature', categoryId: 'work-id', dueDate: '2026-07-25' })

      expect(res.status).toBe(201)
      expect(Category.findOne).not.toHaveBeenCalled()
      expect(Todo.create).toHaveBeenCalledWith({
        title: 'Ship feature',
        categoryId: 'work-id',
        dueDate: '2026-07-25',
      })
    })

    it('rejects a missing title', async () => {
      const app = createApp()
      const res = await request(app).post('/api/todos').send({})

      expect(res.status).toBe(400)
      expect(Todo.create).not.toHaveBeenCalled()
    })

    it('rejects a blank title', async () => {
      const app = createApp()
      const res = await request(app).post('/api/todos').send({ title: '   ' })

      expect(res.status).toBe(400)
      expect(Todo.create).not.toHaveBeenCalled()
    })

    it('defaults priority to Medium when not provided (schema-level default)', async () => {
      Category.findOne.mockResolvedValue({ _id: 'uncategorized-id', name: 'Uncategorized' })
      Todo.create.mockResolvedValue({
        _id: 't3',
        title: 'Water the plants',
        categoryId: 'uncategorized-id',
        completed: false,
        dueDate: null,
        priority: 'Medium',
        tags: [],
        body: null,
      })

      const app = createApp()
      const res = await request(app)
        .post('/api/todos')
        .send({ title: 'Water the plants', profileId: 'profile-1' })

      expect(res.status).toBe(201)
      expect(res.body.priority).toBe('Medium')
      // No priority key passed through explicitly — the model's schema
      // default is what's responsible for it in real usage.
      expect(Todo.create).toHaveBeenCalledWith({
        title: 'Water the plants',
        categoryId: 'uncategorized-id',
        dueDate: null,
      })
    })

    it('passes through priority, tags, and body when the client supplies them', async () => {
      Todo.create.mockResolvedValue({
        _id: 't4',
        title: 'Plan launch',
        categoryId: 'work-id',
        dueDate: '2026-08-01',
        priority: 'High',
        tags: ['urgent'],
        body: { type: 'doc', content: [] },
      })

      const app = createApp()
      const res = await request(app).post('/api/todos').send({
        title: 'Plan launch',
        categoryId: 'work-id',
        dueDate: '2026-08-01',
        priority: 'High',
        tags: ['urgent'],
        body: { type: 'doc', content: [] },
      })

      expect(res.status).toBe(201)
      // bodyText is the denormalized plain-text extract of `body`, computed
      // by the route (see utils/tiptapText.ts) and included alongside it —
      // needed by GET /api/todos/search (ticket 11).
      expect(Todo.create).toHaveBeenCalledWith({
        title: 'Plan launch',
        categoryId: 'work-id',
        dueDate: '2026-08-01',
        priority: 'High',
        tags: ['urgent'],
        body: { type: 'doc', content: [] },
        bodyText: '',
      })
    })

    it('passes through officeLinked when the client supplies it', async () => {
      Todo.create.mockResolvedValue({
        _id: 't5',
        title: 'Bring badge',
        categoryId: 'work-id',
        dueDate: null,
        officeLinked: true,
      })

      const app = createApp()
      const res = await request(app)
        .post('/api/todos')
        .send({ title: 'Bring badge', categoryId: 'work-id', officeLinked: true })

      expect(res.status).toBe(201)
      expect(Todo.create).toHaveBeenCalledWith({
        title: 'Bring badge',
        categoryId: 'work-id',
        dueDate: null,
        officeLinked: true,
      })
    })
  })

  describe('GET /api/todos/tags', () => {
    it("returns the sorted list of distinct tags in use within the given profile's categories", async () => {
      Category.find.mockResolvedValue([{ _id: 'work-id' }, { _id: 'uncategorized-id' }])
      Todo.distinct.mockResolvedValue(['urgent', 'home', 'waiting-on-someone'])

      const app = createApp()
      const res = await request(app).get('/api/todos/tags').query({ profileId: 'profile-1' })

      expect(res.status).toBe(200)
      expect(res.body).toEqual(['home', 'urgent', 'waiting-on-someone'])
      expect(Category.find).toHaveBeenCalledWith({ profileId: 'profile-1' }, { _id: 1 })
      expect(Todo.distinct).toHaveBeenCalledWith('tags', {
        categoryId: { $in: ['work-id', 'uncategorized-id'] },
      })
    })

    it('rejects a missing profileId', async () => {
      const app = createApp()
      const res = await request(app).get('/api/todos/tags')

      expect(res.status).toBe(400)
      expect(res.body).toEqual({ error: 'profileId is required' })
      expect(Todo.distinct).not.toHaveBeenCalled()
    })

    it("never suggests another profile's tags — profile A's categories don't leak into profile B's query", async () => {
      Category.find.mockImplementation(({ profileId }: { profileId: string }) =>
        Promise.resolve(
          profileId === 'profile-a' ? [{ _id: 'a-cat-id' }] : [{ _id: 'b-cat-id' }],
        ),
      )
      Todo.distinct.mockResolvedValue([])

      const app = createApp()
      await request(app).get('/api/todos/tags').query({ profileId: 'profile-b' })

      expect(Todo.distinct).toHaveBeenCalledWith('tags', { categoryId: { $in: ['b-cat-id'] } })
      expect(Todo.distinct).not.toHaveBeenCalledWith('tags', { categoryId: { $in: ['a-cat-id'] } })
    })

    it('is not swallowed by the /:id-shaped routes (route ordering)', async () => {
      Todo.distinct.mockResolvedValue([])

      const app = createApp()
      const res = await request(app).get('/api/todos/tags').query({ profileId: 'profile-1' })

      expect(res.status).toBe(200)
      // If /:id had matched first, this would hit findById-style handling
      // instead, and Todo.distinct would never be called.
      expect(Todo.distinct).toHaveBeenCalled()
    })
  })

  describe('GET /api/todos/search', () => {
    it('matches by title (case-insensitive), scoped to the given profile', async () => {
      Category.find.mockResolvedValue([{ _id: 'work-id' }])
      const docs = [{ _id: 't1', title: 'Buy Milk', bodyText: '' }]
      Todo.find.mockReturnValue({ sort: vi.fn().mockResolvedValue(docs) })

      const app = createApp()
      const res = await request(app)
        .get('/api/todos/search')
        .query({ q: 'milk', profileId: 'profile-1' })

      expect(res.status).toBe(200)
      expect(res.body).toEqual(docs)
      expect(Todo.find).toHaveBeenCalledWith({
        categoryId: { $in: ['work-id'] },
        $or: [{ title: { $regex: 'milk', $options: 'i' } }, { bodyText: { $regex: 'milk', $options: 'i' } }],
      })
    })

    it('matches by the denormalized bodyText extract', async () => {
      Category.find.mockResolvedValue([{ _id: 'work-id' }])
      const docs = [{ _id: 't2', title: 'Groceries', bodyText: 'remember to buy oat milk' }]
      Todo.find.mockReturnValue({ sort: vi.fn().mockResolvedValue(docs) })

      const app = createApp()
      const res = await request(app)
        .get('/api/todos/search')
        .query({ q: 'oat', profileId: 'profile-1' })

      expect(res.status).toBe(200)
      expect(res.body).toEqual(docs)
      expect(Todo.find).toHaveBeenCalledWith({
        categoryId: { $in: ['work-id'] },
        $or: [{ title: { $regex: 'oat', $options: 'i' } }, { bodyText: { $regex: 'oat', $options: 'i' } }],
      })
    })

    it('rejects a missing profileId', async () => {
      const app = createApp()
      const res = await request(app).get('/api/todos/search').query({ q: 'milk' })

      expect(res.status).toBe(400)
      expect(res.body).toEqual({ error: 'profileId is required' })
      expect(Todo.find).not.toHaveBeenCalled()
    })

    it("never returns another profile's todos — profile A's results stay out of profile B's search", async () => {
      Category.find.mockImplementation(({ profileId }: { profileId: string }) =>
        Promise.resolve(
          profileId === 'profile-a' ? [{ _id: 'a-cat-id' }] : [{ _id: 'b-cat-id' }],
        ),
      )
      Todo.find.mockReturnValue({ sort: vi.fn().mockResolvedValue([]) })

      const app = createApp()
      await request(app).get('/api/todos/search').query({ q: 'milk', profileId: 'profile-b' })

      expect(Todo.find).toHaveBeenCalledWith(
        expect.objectContaining({ categoryId: { $in: ['b-cat-id'] } }),
      )
      expect(Todo.find).not.toHaveBeenCalledWith(
        expect.objectContaining({ categoryId: { $in: ['a-cat-id'] } }),
      )
    })

    it('is not swallowed by the /:id-shaped routes (route ordering)', async () => {
      Todo.find.mockReturnValue({ sort: vi.fn().mockResolvedValue([]) })

      const app = createApp()
      const res = await request(app).get('/api/todos/search').query({ profileId: 'profile-1' })

      expect(res.status).toBe(200)
      // If /:id had matched first, Todo.findById would be hit instead.
      expect(Todo.find).toHaveBeenCalled()
      expect(Todo.findById).not.toHaveBeenCalled()
    })

    it('returns all of the profile\'s todos when q is missing or empty', async () => {
      Category.find.mockResolvedValue([{ _id: 'work-id' }])
      const docs = [{ _id: 't1' }, { _id: 't2' }]
      Todo.find.mockReturnValue({ sort: vi.fn().mockResolvedValue(docs) })

      const app = createApp()
      const res = await request(app).get('/api/todos/search').query({ q: '', profileId: 'profile-1' })

      expect(res.status).toBe(200)
      expect(res.body).toEqual(docs)
      expect(Todo.find).toHaveBeenCalledWith({ categoryId: { $in: ['work-id'] } })
    })
  })

  describe('GET /api/todos', () => {
    it("lists the given profile's todos", async () => {
      Category.find.mockResolvedValue([{ _id: 'uncategorized-id' }])
      const docs = [{ _id: 't1', title: 'Buy milk', completed: false, dueDate: null }]
      Todo.find.mockReturnValue({ sort: vi.fn().mockResolvedValue(docs) })

      const app = createApp()
      const res = await request(app).get('/api/todos').query({ profileId: 'profile-1' })

      expect(res.status).toBe(200)
      expect(res.body).toEqual(docs)
      expect(Category.find).toHaveBeenCalledWith({ profileId: 'profile-1' }, { _id: 1 })
      expect(Todo.find).toHaveBeenCalledWith({ categoryId: { $in: ['uncategorized-id'] } })
    })

    it('rejects a missing profileId', async () => {
      const app = createApp()
      const res = await request(app).get('/api/todos')

      expect(res.status).toBe(400)
      expect(res.body).toEqual({ error: 'profileId is required' })
      expect(Todo.find).not.toHaveBeenCalled()
    })

    it("never returns another profile's todos", async () => {
      Category.find.mockImplementation(({ profileId }: { profileId: string }) =>
        Promise.resolve(
          profileId === 'profile-a' ? [{ _id: 'a-cat-id' }] : [{ _id: 'b-cat-id' }],
        ),
      )
      Todo.find.mockReturnValue({ sort: vi.fn().mockResolvedValue([]) })

      const app = createApp()
      await request(app).get('/api/todos').query({ profileId: 'profile-b' })

      expect(Todo.find).toHaveBeenCalledWith({ categoryId: { $in: ['b-cat-id'] } })
      expect(Todo.find).not.toHaveBeenCalledWith({ categoryId: { $in: ['a-cat-id'] } })
    })
  })

  describe('PATCH /api/todos/:id/toggle', () => {
    it('flips completed from false to true', async () => {
      const doc = { _id: 't1', title: 'Buy milk', completed: false, save: vi.fn().mockResolvedValue(undefined) }
      Todo.findById.mockResolvedValue(doc)

      const app = createApp()
      const res = await request(app).patch('/api/todos/t1/toggle')

      expect(res.status).toBe(200)
      expect(res.body.completed).toBe(true)
      expect(doc.save).toHaveBeenCalled()
    })

    it('flips completed from true back to false (reopen)', async () => {
      const doc = { _id: 't1', title: 'Buy milk', completed: true, save: vi.fn().mockResolvedValue(undefined) }
      Todo.findById.mockResolvedValue(doc)

      const app = createApp()
      const res = await request(app).patch('/api/todos/t1/toggle')

      expect(res.status).toBe(200)
      expect(res.body.completed).toBe(false)
    })

    it('returns 404 when the todo does not exist', async () => {
      Todo.findById.mockResolvedValue(null)

      const app = createApp()
      const res = await request(app).patch('/api/todos/does-not-exist/toggle')

      expect(res.status).toBe(404)
    })

    it('creates a daily-advanced next instance when completing a recurring todo', async () => {
      const doc = {
        _id: 't1',
        title: 'Water the plants',
        categoryId: 'work-id',
        priority: 'High',
        tags: ['home'],
        body: { type: 'doc', content: [] },
        recurrence: { pattern: 'daily' },
        dueDate: '2026-07-25',
        completed: false,
        save: vi.fn().mockResolvedValue(undefined),
      }
      Todo.findById.mockResolvedValue(doc)
      Todo.create.mockResolvedValue({ _id: 't2' })

      const app = createApp()
      const res = await request(app).patch('/api/todos/t1/toggle')

      expect(res.status).toBe(200)
      expect(res.body.completed).toBe(true)
      expect(Todo.create).toHaveBeenCalledWith({
        title: 'Water the plants',
        categoryId: 'work-id',
        priority: 'High',
        tags: ['home'],
        body: { type: 'doc', content: [] },
        recurrence: { pattern: 'daily' },
        completed: false,
        dueDate: '2026-07-26',
      })
    })

    it('creates a weekly-advanced next instance (+7 days)', async () => {
      const doc = {
        _id: 't1',
        title: 'Weekly review',
        categoryId: 'work-id',
        priority: 'Medium',
        tags: [],
        body: null,
        recurrence: { pattern: 'weekly' },
        dueDate: '2026-07-25',
        completed: false,
        save: vi.fn().mockResolvedValue(undefined),
      }
      Todo.findById.mockResolvedValue(doc)
      Todo.create.mockResolvedValue({ _id: 't2' })

      const app = createApp()
      await request(app).patch('/api/todos/t1/toggle')

      expect(Todo.create).toHaveBeenCalledWith(
        expect.objectContaining({ dueDate: '2026-08-01' }),
      )
    })

    it('creates a monthly-advanced next instance (same day, next month)', async () => {
      const doc = {
        _id: 't1',
        title: 'Pay rent',
        categoryId: 'work-id',
        priority: 'Medium',
        tags: [],
        body: null,
        recurrence: { pattern: 'monthly' },
        dueDate: '2026-07-25',
        completed: false,
        save: vi.fn().mockResolvedValue(undefined),
      }
      Todo.findById.mockResolvedValue(doc)
      Todo.create.mockResolvedValue({ _id: 't2' })

      const app = createApp()
      await request(app).patch('/api/todos/t1/toggle')

      expect(Todo.create).toHaveBeenCalledWith(
        expect.objectContaining({ dueDate: '2026-08-25' }),
      )
    })

    it('does not crash on a monthly rollover from a month-end date (JS Date rollover is acceptable)', async () => {
      const doc = {
        _id: 't1',
        title: 'End of month task',
        categoryId: 'work-id',
        priority: 'Medium',
        tags: [],
        body: null,
        recurrence: { pattern: 'monthly' },
        dueDate: '2026-01-31',
        completed: false,
        save: vi.fn().mockResolvedValue(undefined),
      }
      Todo.findById.mockResolvedValue(doc)
      Todo.create.mockResolvedValue({ _id: 't2' })

      const app = createApp()
      const res = await request(app).patch('/api/todos/t1/toggle')

      expect(res.status).toBe(200)
      expect(Todo.create).toHaveBeenCalled()
    })

    it('does not create a next instance when reopening (true -> false)', async () => {
      const doc = {
        _id: 't1',
        title: 'Water the plants',
        categoryId: 'work-id',
        recurrence: { pattern: 'daily' },
        dueDate: '2026-07-25',
        completed: true,
        save: vi.fn().mockResolvedValue(undefined),
      }
      Todo.findById.mockResolvedValue(doc)

      const app = createApp()
      const res = await request(app).patch('/api/todos/t1/toggle')

      expect(res.status).toBe(200)
      expect(res.body.completed).toBe(false)
      expect(Todo.create).not.toHaveBeenCalled()
    })

    it('completes normally without creating a next instance when a recurring todo has no dueDate', async () => {
      const doc = {
        _id: 't1',
        title: 'Someday task',
        categoryId: 'work-id',
        recurrence: { pattern: 'daily' },
        dueDate: null,
        completed: false,
        save: vi.fn().mockResolvedValue(undefined),
      }
      Todo.findById.mockResolvedValue(doc)

      const app = createApp()
      const res = await request(app).patch('/api/todos/t1/toggle')

      expect(res.status).toBe(200)
      expect(res.body.completed).toBe(true)
      expect(Todo.create).not.toHaveBeenCalled()
    })

    it('does not create a next instance for a non-recurring todo', async () => {
      const doc = {
        _id: 't1',
        title: 'One-off task',
        categoryId: 'work-id',
        recurrence: null,
        dueDate: '2026-07-25',
        completed: false,
        save: vi.fn().mockResolvedValue(undefined),
      }
      Todo.findById.mockResolvedValue(doc)

      const app = createApp()
      const res = await request(app).patch('/api/todos/t1/toggle')

      expect(res.status).toBe(200)
      expect(Todo.create).not.toHaveBeenCalled()
    })

    it('does not touch any other todo when completing one that other todos link to (no-cascade invariant)', async () => {
      const doc = {
        _id: 't1',
        title: 'Linked-to todo',
        recurrence: null,
        dueDate: null,
        completed: false,
        save: vi.fn().mockResolvedValue(undefined),
      }
      Todo.findById.mockResolvedValue(doc)

      const app = createApp()
      const res = await request(app).patch('/api/todos/t1/toggle')

      expect(res.status).toBe(200)
      // A cascade implementation would need to look up/update whichever
      // parent todos reference t1 in their linkedTodoIds — assert neither
      // ever happens.
      expect(Todo.findByIdAndUpdate).not.toHaveBeenCalled()
      expect(Todo.find).not.toHaveBeenCalled()
    })
  })

  describe('PATCH /api/todos/:id', () => {
    it('updates priority, dueDate, and tags', async () => {
      const updated = {
        _id: 't1',
        title: 'Buy milk',
        priority: 'High',
        dueDate: '2026-08-01',
        tags: ['errand'],
      }
      Todo.findByIdAndUpdate.mockResolvedValue(updated)

      const app = createApp()
      const res = await request(app)
        .patch('/api/todos/t1')
        .send({ priority: 'High', dueDate: '2026-08-01', tags: ['errand'] })

      expect(res.status).toBe(200)
      expect(res.body).toEqual(updated)
      expect(Todo.findByIdAndUpdate).toHaveBeenCalledWith(
        't1',
        { priority: 'High', dueDate: '2026-08-01', tags: ['errand'] },
        { new: true, runValidators: true },
      )
    })

    it('reassigns categoryId', async () => {
      Todo.findByIdAndUpdate.mockResolvedValue({ _id: 't1', categoryId: 'personal-id' })

      const app = createApp()
      const res = await request(app).patch('/api/todos/t1').send({ categoryId: 'personal-id' })

      expect(res.status).toBe(200)
      expect(Todo.findByIdAndUpdate).toHaveBeenCalledWith(
        't1',
        { categoryId: 'personal-id' },
        { new: true, runValidators: true },
      )
    })

    it('updates the rich-text body', async () => {
      const body = { type: 'doc', content: [{ type: 'paragraph' }] }
      Todo.findByIdAndUpdate.mockResolvedValue({ _id: 't1', body })

      const app = createApp()
      const res = await request(app).patch('/api/todos/t1').send({ body })

      expect(res.status).toBe(200)
      expect(res.body.body).toEqual(body)
    })

    it('rejects a blank title', async () => {
      const app = createApp()
      const res = await request(app).patch('/api/todos/t1').send({ title: '   ' })

      expect(res.status).toBe(400)
      expect(Todo.findByIdAndUpdate).not.toHaveBeenCalled()
    })

    it('returns 404 when the todo does not exist', async () => {
      Todo.findByIdAndUpdate.mockResolvedValue(null)

      const app = createApp()
      const res = await request(app).patch('/api/todos/does-not-exist').send({ priority: 'Low' })

      expect(res.status).toBe(404)
    })

    it('sets recurrence to a pattern', async () => {
      Todo.findByIdAndUpdate.mockResolvedValue({
        _id: 't1',
        recurrence: { pattern: 'weekly' },
      })

      const app = createApp()
      const res = await request(app)
        .patch('/api/todos/t1')
        .send({ recurrence: { pattern: 'weekly' } })

      expect(res.status).toBe(200)
      expect(res.body.recurrence).toEqual({ pattern: 'weekly' })
      expect(Todo.findByIdAndUpdate).toHaveBeenCalledWith(
        't1',
        { recurrence: { pattern: 'weekly' } },
        { new: true, runValidators: true },
      )
    })

    it('updates officeLinked', async () => {
      Todo.findByIdAndUpdate.mockResolvedValue({ _id: 't1', officeLinked: true })

      const app = createApp()
      const res = await request(app).patch('/api/todos/t1').send({ officeLinked: true })

      expect(res.status).toBe(200)
      expect(res.body.officeLinked).toBe(true)
      expect(Todo.findByIdAndUpdate).toHaveBeenCalledWith(
        't1',
        { officeLinked: true },
        { new: true, runValidators: true },
      )
    })

    it('turns recurrence off via recurrence: null', async () => {
      Todo.findByIdAndUpdate.mockResolvedValue({ _id: 't1', recurrence: null })

      const app = createApp()
      const res = await request(app).patch('/api/todos/t1').send({ recurrence: null })

      expect(res.status).toBe(200)
      expect(res.body.recurrence).toBeNull()
      expect(Todo.findByIdAndUpdate).toHaveBeenCalledWith(
        't1',
        { recurrence: null },
        { new: true, runValidators: true },
      )
    })

    it('persists a provided linkedTodoIds array', async () => {
      Todo.findByIdAndUpdate.mockResolvedValue({ _id: 't1', linkedTodoIds: ['t2', 't3'] })

      const app = createApp()
      const res = await request(app)
        .patch('/api/todos/t1')
        .send({ linkedTodoIds: ['t2', 't3'] })

      expect(res.status).toBe(200)
      expect(res.body.linkedTodoIds).toEqual(['t2', 't3'])
      expect(Todo.findByIdAndUpdate).toHaveBeenCalledWith(
        't1',
        { linkedTodoIds: ['t2', 't3'] },
        { new: true, runValidators: true },
      )
    })

    it('clears linkedTodoIds via an empty array (unlink)', async () => {
      Todo.findByIdAndUpdate.mockResolvedValue({ _id: 't1', linkedTodoIds: [] })

      const app = createApp()
      const res = await request(app).patch('/api/todos/t1').send({ linkedTodoIds: [] })

      expect(res.status).toBe(200)
      expect(res.body.linkedTodoIds).toEqual([])
      expect(Todo.findByIdAndUpdate).toHaveBeenCalledWith(
        't1',
        { linkedTodoIds: [] },
        { new: true, runValidators: true },
      )
    })
  })

  describe('DELETE /api/todos/:id', () => {
    it('deletes a todo', async () => {
      Todo.findById.mockResolvedValue({ _id: 't1' })
      Todo.findByIdAndDelete.mockResolvedValue({ _id: 't1' })

      const app = createApp()
      const res = await request(app).delete('/api/todos/t1')

      expect(res.status).toBe(204)
      expect(Todo.findByIdAndDelete).toHaveBeenCalledWith('t1')
    })

    it('returns 404 when the todo does not exist', async () => {
      Todo.findById.mockResolvedValue(null)

      const app = createApp()
      const res = await request(app).delete('/api/todos/does-not-exist')

      expect(res.status).toBe(404)
      expect(Todo.findByIdAndDelete).not.toHaveBeenCalled()
    })

    it('does not touch any other todo when deleting one that other todos link to (no-cascade invariant)', async () => {
      Todo.findById.mockResolvedValue({ _id: 't1' })
      Todo.findByIdAndDelete.mockResolvedValue({ _id: 't1' })

      const app = createApp()
      const res = await request(app).delete('/api/todos/t1')

      expect(res.status).toBe(204)
      // A cascade implementation would need to look up/update whichever
      // parent todos reference t1 in their linkedTodoIds — assert neither
      // ever happens. Dangling references are left for the frontend to
      // tolerate, per the spec.
      expect(Todo.findByIdAndUpdate).not.toHaveBeenCalled()
      expect(Todo.find).not.toHaveBeenCalled()
    })
  })
})
