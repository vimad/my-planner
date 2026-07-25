import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/models/Todo.js', () => {
  return {
    Todo: {
      find: vi.fn(),
      create: vi.fn(),
      findById: vi.fn(),
      findByIdAndDelete: vi.fn(),
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
