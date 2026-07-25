import request from 'supertest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Verifies the wiring called out in ticket 07: categories.js's GET route
// looks up Todo via mongoose.model('Todo') from the global registry (not a
// direct import — see categories.js's getCounts helper), guarded by
// mongoose.modelNames().includes('Todo'), so it stays decoupled from whether
// a Todo model happens to exist yet. That registry lookup is the reason this
// test can't follow the usual vi.mock('../src/models/Todo.js', ...)
// convention: mocking the whole module would stop Todo.js's
// mongoose.model('Todo', todoSchema) call from ever registering the model,
// so mongoose.modelNames() would never include 'Todo' and getCounts would
// always take its zero-counts short-circuit — the exact case this test
// exists to move past. Importing the real Todo model (so it registers) and
// stubbing its static countDocuments is the one seam that actually exercises
// this wiring; everything else about the request stays at the same HTTP
// boundary as the other route tests (createApp() + supertest).
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
