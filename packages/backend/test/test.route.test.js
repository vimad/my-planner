import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/models/Test.js', () => {
  return {
    Test: {
      findOne: vi.fn(),
    },
  }
})

const { Test } = await import('../src/models/Test.js')
const { createApp } = await import('../src/app.js')

describe('GET /api/test', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns the seeded document', async () => {
    Test.findOne.mockReturnValue({
      sort: vi.fn().mockResolvedValue({ name: 'vinod' }),
    })

    const app = createApp()
    const res = await request(app).get('/api/test')

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ name: 'vinod' })
  })

  it('returns 404 when no document exists', async () => {
    Test.findOne.mockReturnValue({
      sort: vi.fn().mockResolvedValue(null),
    })

    const app = createApp()
    const res = await request(app).get('/api/test')

    expect(res.status).toBe(404)
  })
})
