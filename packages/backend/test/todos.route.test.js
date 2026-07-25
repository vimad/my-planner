import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/models/Todo.js', () => {
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

vi.mock('../src/models/Category.js', () => {
  return {
    Category: {
      findOne: vi.fn(),
    },
  }
})

const { Todo } = await import('../src/models/Todo.js')
const { Category } = await import('../src/models/Category.js')
const { createApp } = await import('../src/app.js')

describe('Todo routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('POST /api/todos', () => {
    it('quick-creates a todo from just a title, defaulting to the Uncategorized category', async () => {
      Category.findOne.mockResolvedValue({ _id: 'uncategorized-id', name: 'Uncategorized' })
      Todo.create.mockResolvedValue({
        _id: 't1',
        title: 'Buy milk',
        categoryId: 'uncategorized-id',
        completed: false,
        dueDate: null,
      })

      const app = createApp()
      const res = await request(app).post('/api/todos').send({ title: 'Buy milk' })

      expect(res.status).toBe(201)
      expect(Category.findOne).toHaveBeenCalledWith({ name: 'Uncategorized' })
      expect(Todo.create).toHaveBeenCalledWith({
        title: 'Buy milk',
        categoryId: 'uncategorized-id',
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
      const res = await request(app).post('/api/todos').send({ title: 'Water the plants' })

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
      // by the route (see utils/tiptapText.js) and included alongside it —
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
  })

  describe('GET /api/todos/tags', () => {
    it('returns the sorted list of distinct tags in use', async () => {
      Todo.distinct.mockResolvedValue(['urgent', 'home', 'waiting-on-someone'])

      const app = createApp()
      const res = await request(app).get('/api/todos/tags')

      expect(res.status).toBe(200)
      expect(res.body).toEqual(['home', 'urgent', 'waiting-on-someone'])
      expect(Todo.distinct).toHaveBeenCalledWith('tags')
    })

    it('is not swallowed by the /:id-shaped routes (route ordering)', async () => {
      Todo.distinct.mockResolvedValue([])

      const app = createApp()
      const res = await request(app).get('/api/todos/tags')

      expect(res.status).toBe(200)
      // If /:id had matched first, this would hit findById-style handling
      // instead, and Todo.distinct would never be called.
      expect(Todo.distinct).toHaveBeenCalled()
    })
  })

  describe('GET /api/todos/search', () => {
    it('matches by title (case-insensitive)', async () => {
      const docs = [{ _id: 't1', title: 'Buy Milk', bodyText: '' }]
      Todo.find.mockReturnValue({ sort: vi.fn().mockResolvedValue(docs) })

      const app = createApp()
      const res = await request(app).get('/api/todos/search').query({ q: 'milk' })

      expect(res.status).toBe(200)
      expect(res.body).toEqual(docs)
      expect(Todo.find).toHaveBeenCalledWith({
        $or: [{ title: { $regex: 'milk', $options: 'i' } }, { bodyText: { $regex: 'milk', $options: 'i' } }],
      })
    })

    it('matches by the denormalized bodyText extract', async () => {
      const docs = [{ _id: 't2', title: 'Groceries', bodyText: 'remember to buy oat milk' }]
      Todo.find.mockReturnValue({ sort: vi.fn().mockResolvedValue(docs) })

      const app = createApp()
      const res = await request(app).get('/api/todos/search').query({ q: 'oat' })

      expect(res.status).toBe(200)
      expect(res.body).toEqual(docs)
      expect(Todo.find).toHaveBeenCalledWith({
        $or: [{ title: { $regex: 'oat', $options: 'i' } }, { bodyText: { $regex: 'oat', $options: 'i' } }],
      })
    })

    it('is not swallowed by the /:id-shaped routes (route ordering)', async () => {
      Todo.find.mockReturnValue({ sort: vi.fn().mockResolvedValue([]) })

      const app = createApp()
      const res = await request(app).get('/api/todos/search')

      expect(res.status).toBe(200)
      // If /:id had matched first, Todo.findById would be hit instead.
      expect(Todo.find).toHaveBeenCalled()
      expect(Todo.findById).not.toHaveBeenCalled()
    })

    it('returns all todos when q is missing or empty', async () => {
      const docs = [{ _id: 't1' }, { _id: 't2' }]
      Todo.find.mockReturnValue({ sort: vi.fn().mockResolvedValue(docs) })

      const app = createApp()
      const res = await request(app).get('/api/todos/search').query({ q: '' })

      expect(res.status).toBe(200)
      expect(res.body).toEqual(docs)
      expect(Todo.find).toHaveBeenCalledWith({})
    })
  })

  describe('GET /api/todos', () => {
    it('lists all todos', async () => {
      const docs = [{ _id: 't1', title: 'Buy milk', completed: false, dueDate: null }]
      Todo.find.mockReturnValue({ sort: vi.fn().mockResolvedValue(docs) })

      const app = createApp()
      const res = await request(app).get('/api/todos')

      expect(res.status).toBe(200)
      expect(res.body).toEqual(docs)
    })
  })

  describe('PATCH /api/todos/:id/toggle', () => {
    it('flips completed from false to true', async () => {
      const doc = { _id: 't1', title: 'Buy milk', completed: false, save: vi.fn().mockResolvedValue() }
      Todo.findById.mockResolvedValue(doc)

      const app = createApp()
      const res = await request(app).patch('/api/todos/t1/toggle')

      expect(res.status).toBe(200)
      expect(res.body.completed).toBe(true)
      expect(doc.save).toHaveBeenCalled()
    })

    it('flips completed from true back to false (reopen)', async () => {
      const doc = { _id: 't1', title: 'Buy milk', completed: true, save: vi.fn().mockResolvedValue() }
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
  })
})
