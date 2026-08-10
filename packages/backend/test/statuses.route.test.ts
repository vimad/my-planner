import request from 'supertest'
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'

interface MockedStatusModel {
  find: Mock
}

vi.mock('../src/models/Status.ts', () => ({ Status: { find: vi.fn() } }))

const { Status } = (await import('../src/models/Status.ts')) as unknown as { Status: MockedStatusModel }
const { createApp } = await import('../src/app.ts')

describe('GET /api/statuses', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns the mirrored status set ordered by column order', async () => {
    const docs = [
      { name: 'To Do', order: 0, category: 'todo' },
      { name: 'Done', order: 1, category: 'done' },
    ]
    const sort = vi.fn().mockResolvedValue(docs)
    Status.find.mockReturnValue({ sort })

    const app = createApp()
    const res = await request(app).get('/api/statuses')

    expect(res.status).toBe(200)
    expect(sort).toHaveBeenCalledWith({ order: 1 })
    expect(res.body).toEqual(docs)
  })
})
