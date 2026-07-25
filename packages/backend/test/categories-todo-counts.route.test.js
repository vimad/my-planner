import request from 'supertest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Verifies the wiring called out in ticket 07: categories.js's GET route
// already computes remaining/completed counts via mongoose.model('Todo')
// guarded by mongoose.modelNames().includes('Todo'). Now that the real Todo
// model exists (imported below, unmocked, so it registers with mongoose),
// those counts should reflect real data with no changes to categories.js.
// We stub Todo.countDocuments (rather than hitting a real database) to keep
// this at the same "mock at the module boundary" seam as the other route tests.
vi.mock('../src/models/Category.js', () => {
  return {
    Category: {
      find: vi.fn(),
    },
  }
})

const { Category } = await import('../src/models/Category.js')
const { Todo } = await import('../src/models/Todo.js')
const { createApp } = await import('../src/app.js')

describe('GET /api/categories todo-count wiring', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('reflects real Todo counts now that the Todo model is registered', async () => {
    const docs = [
      {
        _id: 'work-id',
        toObject: () => ({ _id: 'work-id', name: 'Work', color: '#4361ee' }),
      },
      {
        _id: 'home-id',
        toObject: () => ({ _id: 'home-id', name: 'Home', color: '#2a9d8f' }),
      },
    ]
    Category.find.mockReturnValue({ sort: vi.fn().mockResolvedValue(docs) })

    vi.spyOn(Todo, 'countDocuments').mockImplementation(({ categoryId, completed }) => {
      if (categoryId === 'work-id') return Promise.resolve(completed ? 1 : 2)
      return Promise.resolve(0)
    })

    const app = createApp()
    const res = await request(app).get('/api/categories')

    expect(res.status).toBe(200)
    expect(res.body).toEqual([
      { _id: 'work-id', name: 'Work', color: '#4361ee', remaining: 2, completed: 1 },
      { _id: 'home-id', name: 'Home', color: '#2a9d8f', remaining: 0, completed: 0 },
    ])
  })
})
