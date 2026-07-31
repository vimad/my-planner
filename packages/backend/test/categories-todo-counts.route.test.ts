import request from 'supertest'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'

// Verifies the wiring called out in ticket 07: categories.ts's GET route
// looks up Todo via mongoose.model('Todo') from the global registry (not a
// direct import — see categories.ts's getCounts helper), guarded by
// mongoose.modelNames().includes('Todo'), so it stays decoupled from whether
// a Todo model happens to exist yet. That registry lookup is the reason this
// test can't follow the usual vi.mock('../src/models/Todo.ts', ...)
// convention: mocking the whole module would stop Todo.ts's
// mongoose.model('Todo', todoSchema) call from ever registering the model,
// so mongoose.modelNames() would never include 'Todo' and getCounts would
// always take its zero-counts short-circuit — the exact case this test
// exists to move past. Importing the real Todo model (so it registers) and
// stubbing its static countDocuments is the one seam that actually exercises
// this wiring; everything else about the request stays at the same HTTP
// boundary as the other route tests (createApp() + supertest).
interface MockedCategoryModel {
  find: Mock
}

vi.mock('../src/models/Category.ts', () => {
  return {
    Category: {
      find: vi.fn(),
    },
  }
})

const { Category } = (await import('../src/models/Category.ts')) as unknown as {
  Category: MockedCategoryModel
}
const { Todo } = await import('../src/models/Todo.ts')
const { createApp } = await import('../src/app.ts')

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

    // Real Todo.countDocuments is a heavily-overloaded Mongoose static
    // returning a QueryWithHelpers (thenable, not a literal Promise) — the
    // cast below is the same kind of narrow, deliberate escape hatch Issue
    // 03 used for the categoryId cast: it preserves the exact runtime
    // behavior (a resolvable count) without fighting Mongoose's static
    // overload resolution for a test-only stub.
    const countDocumentsImpl = ((filter: { categoryId?: string; completed?: boolean }) => {
      const { categoryId, completed } = filter
      if (categoryId === 'work-id') return Promise.resolve(completed ? 1 : 2)
      return Promise.resolve(0)
    }) as unknown as typeof Todo.countDocuments
    vi.spyOn(Todo, 'countDocuments').mockImplementation(countDocumentsImpl)

    const app = createApp()
    const res = await request(app).get('/api/categories').query({ profileId: 'p1' })

    expect(res.status).toBe(200)
    expect(res.body).toEqual([
      { _id: 'work-id', name: 'Work', color: '#4361ee', remaining: 2, completed: 1 },
      { _id: 'home-id', name: 'Home', color: '#2a9d8f', remaining: 0, completed: 0 },
    ])
  })
})
