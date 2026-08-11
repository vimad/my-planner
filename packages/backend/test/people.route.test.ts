import request from 'supertest'
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'

interface MockedPersonModel {
  find: Mock
  create: Mock
  findByIdAndUpdate: Mock
  findByIdAndDelete: Mock
}

vi.mock('../src/models/Person.ts', () => {
  return {
    Person: {
      find: vi.fn(),
      create: vi.fn(),
      findByIdAndUpdate: vi.fn(),
      findByIdAndDelete: vi.fn(),
    },
  }
})

vi.mock('../src/services/jiraClient.ts', () => {
  return {
    searchUsers: vi.fn(),
  }
})

const { Person } = (await import('../src/models/Person.ts')) as unknown as { Person: MockedPersonModel }
const { searchUsers } = (await import('../src/services/jiraClient.ts')) as unknown as { searchUsers: Mock }
const { createApp } = await import('../src/app.ts')

describe('Person routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('POST /api/people', () => {
    it('creates a person', async () => {
      Person.create.mockResolvedValue({
        _id: 'p1',
        name: 'Ada Lovelace',
        email: 'ada@example.com',
        jiraAccountId: 'acc-1',
      })

      const app = createApp()
      const res = await request(app)
        .post('/api/people')
        .send({ name: 'Ada Lovelace', email: 'ada@example.com', jiraAccountId: 'acc-1' })

      expect(res.status).toBe(201)
      expect(res.body).toEqual({
        _id: 'p1',
        name: 'Ada Lovelace',
        email: 'ada@example.com',
        jiraAccountId: 'acc-1',
      })
      expect(Person.create).toHaveBeenCalledWith({
        name: 'Ada Lovelace',
        email: 'ada@example.com',
        jiraAccountId: 'acc-1',
      })
    })

    it('rejects a missing field', async () => {
      const app = createApp()
      const res = await request(app).post('/api/people').send({ name: 'Ada Lovelace', email: 'ada@example.com' })

      expect(res.status).toBe(400)
      expect(Person.create).not.toHaveBeenCalled()
    })

    it('rejects a duplicate jiraAccountId with 409', async () => {
      Person.create.mockRejectedValue({ code: 11000 })

      const app = createApp()
      const res = await request(app)
        .post('/api/people')
        .send({ name: 'Ada Lovelace', email: 'ada@example.com', jiraAccountId: 'acc-1' })

      expect(res.status).toBe(409)
    })
  })

  describe('GET /api/people/jira-search', () => {
    it('passes the query through to jiraClient.searchUsers and returns its results', async () => {
      const users = [{ accountId: 'acc-1', displayName: 'Ada Lovelace', emailAddress: 'ada@example.com' }]
      searchUsers.mockResolvedValue(users)

      const app = createApp()
      const res = await request(app).get('/api/people/jira-search').query({ query: 'Ada' })

      expect(res.status).toBe(200)
      expect(res.body).toEqual(users)
      expect(searchUsers).toHaveBeenCalledWith('Ada')
    })

    it('surfaces a null result (degraded/unavailable permission) as-is, not an error', async () => {
      searchUsers.mockResolvedValue(null)

      const app = createApp()
      const res = await request(app).get('/api/people/jira-search').query({ query: 'Ada' })

      expect(res.status).toBe(200)
      expect(res.body).toBeNull()
    })

    it('rejects a missing query', async () => {
      const app = createApp()
      const res = await request(app).get('/api/people/jira-search')

      expect(res.status).toBe(400)
      expect(searchUsers).not.toHaveBeenCalled()
    })
  })

  describe('GET /api/people', () => {
    it('lists all people in creation order', async () => {
      const docs = [
        { _id: 'p1', name: 'Ada Lovelace', email: 'ada@example.com', jiraAccountId: 'acc-1' },
        { _id: 'p2', name: 'Grace Hopper', email: 'grace@example.com', jiraAccountId: 'acc-2' },
      ]
      Person.find.mockReturnValue({ sort: vi.fn().mockResolvedValue(docs) })

      const app = createApp()
      const res = await request(app).get('/api/people')

      expect(res.status).toBe(200)
      expect(res.body).toEqual(docs)
    })
  })

  describe('PATCH /api/people/:id', () => {
    it('edits a person', async () => {
      Person.findByIdAndUpdate.mockResolvedValue({
        _id: 'p1',
        name: 'Ada Byron',
        email: 'ada@example.com',
        jiraAccountId: 'acc-1',
      })

      const app = createApp()
      const res = await request(app).patch('/api/people/p1').send({ name: 'Ada Byron' })

      expect(res.status).toBe(200)
      expect(res.body.name).toBe('Ada Byron')
      expect(Person.findByIdAndUpdate).toHaveBeenCalledWith('p1', { name: 'Ada Byron' }, { returnDocument: 'after' })
    })

    it('returns 404 when the person does not exist', async () => {
      Person.findByIdAndUpdate.mockResolvedValue(null)

      const app = createApp()
      const res = await request(app).patch('/api/people/does-not-exist').send({ name: 'x' })

      expect(res.status).toBe(404)
    })

    it('rejects a duplicate jiraAccountId with 409', async () => {
      Person.findByIdAndUpdate.mockRejectedValue({ code: 11000 })

      const app = createApp()
      const res = await request(app).patch('/api/people/p1').send({ jiraAccountId: 'acc-taken' })

      expect(res.status).toBe(409)
    })
  })

  describe('DELETE /api/people/:id', () => {
    it('deletes a person', async () => {
      Person.findByIdAndDelete.mockResolvedValue({ _id: 'p1' })

      const app = createApp()
      const res = await request(app).delete('/api/people/p1')

      expect(res.status).toBe(204)
      expect(Person.findByIdAndDelete).toHaveBeenCalledWith('p1')
    })

    it('returns 404 when the person does not exist', async () => {
      Person.findByIdAndDelete.mockResolvedValue(null)

      const app = createApp()
      const res = await request(app).delete('/api/people/does-not-exist')

      expect(res.status).toBe(404)
    })
  })
})
