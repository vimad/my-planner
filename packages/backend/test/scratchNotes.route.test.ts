import request from 'supertest'
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'

interface MockedScratchNoteModel {
  create: Mock
  find: Mock
  findById: Mock
  findByIdAndUpdate: Mock
  findByIdAndDelete: Mock
}

interface MockedTodoModel {
  create: Mock
}

interface MockedCategoryModel {
  findOne: Mock
}

vi.mock('../src/models/ScratchNote.ts', () => {
  return {
    ScratchNote: {
      create: vi.fn(),
      find: vi.fn(),
      findById: vi.fn(),
      findByIdAndUpdate: vi.fn(),
      findByIdAndDelete: vi.fn(),
    },
  }
})

vi.mock('../src/models/Todo.ts', () => {
  return {
    Todo: {
      create: vi.fn(),
    },
  }
})

vi.mock('../src/models/Category.ts', () => {
  return {
    Category: {
      findOne: vi.fn(),
    },
  }
})

const { ScratchNote } = (await import('../src/models/ScratchNote.ts')) as unknown as {
  ScratchNote: MockedScratchNoteModel
}
const { Todo } = (await import('../src/models/Todo.ts')) as unknown as {
  Todo: MockedTodoModel
}
const { Category } = (await import('../src/models/Category.ts')) as unknown as {
  Category: MockedCategoryModel
}
const { createApp } = await import('../src/app.ts')

describe('ScratchNote routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('POST /api/scratch-notes', () => {
    it('creates an empty note attached to the given profileId when no lines are supplied', async () => {
      ScratchNote.create.mockResolvedValue({ _id: 'note-1', body: [], archived: false })

      const app = createApp()
      const res = await request(app).post('/api/scratch-notes').send({ profileId: 'profile-1' })

      expect(res.status).toBe(201)
      expect(ScratchNote.create).toHaveBeenCalledWith({ body: [], profileId: 'profile-1' })
    })

    it('creates a note pre-seeded with lines, assigning ids and null promotedTodoId', async () => {
      ScratchNote.create.mockResolvedValue({
        _id: 'note-1',
        body: [{ id: 'line-1', content: { type: 'doc' }, promotedTodoId: null }],
        archived: false,
      })

      const app = createApp()
      const res = await request(app)
        .post('/api/scratch-notes')
        .send({ profileId: 'profile-1', body: [{ id: 'line-1', content: { type: 'doc' } }] })

      expect(res.status).toBe(201)
      expect(ScratchNote.create).toHaveBeenCalledWith({
        body: [{ id: 'line-1', content: { type: 'doc' }, promotedTodoId: null }],
        profileId: 'profile-1',
      })
    })

    it('generates a line id when the client does not supply one', async () => {
      ScratchNote.create.mockResolvedValue({ _id: 'note-1', body: [], archived: false })

      const app = createApp()
      await request(app)
        .post('/api/scratch-notes')
        .send({ profileId: 'profile-1', body: [{ content: { type: 'doc' } }] })

      const [{ body: createdLines }] = ScratchNote.create.mock.calls[0]
      expect(createdLines[0].id).toEqual(expect.any(String))
      expect(createdLines[0].id.length).toBeGreaterThan(0)
    })

    it('rejects a missing profileId', async () => {
      const app = createApp()
      const res = await request(app).post('/api/scratch-notes').send({})

      expect(res.status).toBe(400)
      expect(ScratchNote.create).not.toHaveBeenCalled()
    })
  })

  describe('GET /api/scratch-notes', () => {
    it('lists a profile\'s non-archived notes by default', async () => {
      const docs = [{ _id: 'note-1', body: [], archived: false }]
      ScratchNote.find.mockReturnValue({ sort: vi.fn().mockResolvedValue(docs) })

      const app = createApp()
      const res = await request(app).get('/api/scratch-notes?profileId=profile-1')

      expect(res.status).toBe(200)
      expect(res.body).toEqual(docs)
      expect(ScratchNote.find).toHaveBeenCalledWith({ profileId: 'profile-1', archived: false })
    })

    it('includes archived notes when includeArchived=true', async () => {
      ScratchNote.find.mockReturnValue({ sort: vi.fn().mockResolvedValue([]) })

      const app = createApp()
      await request(app).get('/api/scratch-notes?profileId=profile-1&includeArchived=true')

      expect(ScratchNote.find).toHaveBeenCalledWith({ profileId: 'profile-1' })
    })

    it('rejects a missing profileId', async () => {
      const app = createApp()
      const res = await request(app).get('/api/scratch-notes')

      expect(res.status).toBe(400)
      expect(ScratchNote.find).not.toHaveBeenCalled()
    })

    it('never returns profile A\'s notes when profile B is queried', async () => {
      // The mocked model doesn't itself filter - this test instead pins down
      // the observable contract that matters: querying with profile B's id
      // always issues a query scoped to profile B, never profile A's,
      // regardless of what's actually stored.
      ScratchNote.find.mockReturnValue({ sort: vi.fn().mockResolvedValue([]) })

      const app = createApp()
      await request(app).get('/api/scratch-notes?profileId=profile-b')

      expect(ScratchNote.find).toHaveBeenCalledWith(
        expect.objectContaining({ profileId: 'profile-b' }),
      )
      expect(ScratchNote.find).not.toHaveBeenCalledWith(
        expect.objectContaining({ profileId: 'profile-a' }),
      )
    })
  })

  describe('PATCH /api/scratch-notes/:id', () => {
    it('replaces the lines, preserving promotedTodoId for existing line ids', async () => {
      const note = {
        _id: 'note-1',
        body: [
          { id: 'line-1', content: { type: 'doc', old: true }, promotedTodoId: 'todo-1' },
          { id: 'line-2', content: { type: 'doc', old: true }, promotedTodoId: null },
        ],
        save: vi.fn().mockResolvedValue(undefined),
      }
      ScratchNote.findById.mockResolvedValue(note)

      const app = createApp()
      const res = await request(app)
        .patch('/api/scratch-notes/note-1')
        .send({
          body: [
            { id: 'line-1', content: { type: 'doc', old: false } },
            { id: 'line-2', content: { type: 'doc', old: false } },
            { content: { type: 'doc', new: true } },
          ],
        })

      expect(res.status).toBe(200)
      expect(note.body[0]).toMatchObject({
        id: 'line-1',
        content: { type: 'doc', old: false },
        promotedTodoId: 'todo-1',
      })
      expect(note.body[1]).toMatchObject({
        id: 'line-2',
        content: { type: 'doc', old: false },
        promotedTodoId: null,
      })
      expect(note.body[2]).toMatchObject({
        content: { type: 'doc', new: true },
        promotedTodoId: null,
      })
      expect(note.body[2].id).toEqual(expect.any(String))
      expect(note.save).toHaveBeenCalled()
    })

    it('returns 404 when the note does not exist', async () => {
      ScratchNote.findById.mockResolvedValue(null)

      const app = createApp()
      const res = await request(app).patch('/api/scratch-notes/does-not-exist').send({ body: [] })

      expect(res.status).toBe(404)
    })
  })

  describe('PATCH /api/scratch-notes/:id/archive', () => {
    it('archives a note by default', async () => {
      ScratchNote.findByIdAndUpdate.mockResolvedValue({ _id: 'note-1', archived: true })

      const app = createApp()
      const res = await request(app).patch('/api/scratch-notes/note-1/archive').send({})

      expect(res.status).toBe(200)
      expect(res.body.archived).toBe(true)
      expect(ScratchNote.findByIdAndUpdate).toHaveBeenCalledWith(
        'note-1',
        { archived: true },
        { new: true },
      )
    })

    it('unarchives when { archived: false } is sent', async () => {
      ScratchNote.findByIdAndUpdate.mockResolvedValue({ _id: 'note-1', archived: false })

      const app = createApp()
      const res = await request(app)
        .patch('/api/scratch-notes/note-1/archive')
        .send({ archived: false })

      expect(res.status).toBe(200)
      expect(ScratchNote.findByIdAndUpdate).toHaveBeenCalledWith(
        'note-1',
        { archived: false },
        { new: true },
      )
    })

    it('returns 404 when the note does not exist', async () => {
      ScratchNote.findByIdAndUpdate.mockResolvedValue(null)

      const app = createApp()
      const res = await request(app).patch('/api/scratch-notes/does-not-exist/archive').send({})

      expect(res.status).toBe(404)
    })
  })

  describe('DELETE /api/scratch-notes/:id', () => {
    it('deletes a note', async () => {
      ScratchNote.findById.mockResolvedValue({ _id: 'note-1' })
      ScratchNote.findByIdAndDelete.mockResolvedValue({ _id: 'note-1' })

      const app = createApp()
      const res = await request(app).delete('/api/scratch-notes/note-1')

      expect(res.status).toBe(204)
      expect(ScratchNote.findByIdAndDelete).toHaveBeenCalledWith('note-1')
    })

    it('returns 404 when the note does not exist', async () => {
      ScratchNote.findById.mockResolvedValue(null)

      const app = createApp()
      const res = await request(app).delete('/api/scratch-notes/does-not-exist')

      expect(res.status).toBe(404)
      expect(ScratchNote.findByIdAndDelete).not.toHaveBeenCalled()
    })
  })

  describe('POST /api/scratch-notes/:id/promote', () => {
    const lineContent = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Call the dentist' }] }],
    }

    it('creates a Todo from the line text and sets promotedTodoId, defaulting category', async () => {
      const note = {
        _id: 'note-1',
        body: [{ id: 'line-1', content: lineContent, promotedTodoId: null }],
        save: vi.fn().mockResolvedValue(undefined),
      }
      ScratchNote.findById.mockResolvedValue(note)
      Category.findOne.mockResolvedValue({ _id: 'uncategorized-id', name: 'Uncategorized' })
      Todo.create.mockResolvedValue({ _id: 'todo-1', title: 'Call the dentist' })

      const app = createApp()
      const res = await request(app)
        .post('/api/scratch-notes/note-1/promote')
        .send({ lineId: 'line-1' })

      expect(res.status).toBe(201)
      expect(Todo.create).toHaveBeenCalledWith({
        title: 'Call the dentist',
        categoryId: 'uncategorized-id',
        dueDate: null,
      })
      expect(note.body[0].promotedTodoId).toBe('todo-1')
      expect(note.save).toHaveBeenCalled()
      expect(res.body.todo).toEqual({ _id: 'todo-1', title: 'Call the dentist' })
    })

    it('passes through category, priority, and dueDate when supplied', async () => {
      const note = {
        _id: 'note-1',
        body: [{ id: 'line-1', content: lineContent, promotedTodoId: null }],
        save: vi.fn().mockResolvedValue(undefined),
      }
      ScratchNote.findById.mockResolvedValue(note)
      Todo.create.mockResolvedValue({ _id: 'todo-1', title: 'Call the dentist' })

      const app = createApp()
      const res = await request(app).post('/api/scratch-notes/note-1/promote').send({
        lineId: 'line-1',
        categoryId: 'work-id',
        priority: 'High',
        dueDate: '2026-08-01',
      })

      expect(res.status).toBe(201)
      expect(Category.findOne).not.toHaveBeenCalled()
      expect(Todo.create).toHaveBeenCalledWith({
        title: 'Call the dentist',
        categoryId: 'work-id',
        dueDate: '2026-08-01',
        priority: 'High',
      })
    })

    it('rejects promoting a line that was already promoted', async () => {
      const note = {
        _id: 'note-1',
        body: [{ id: 'line-1', content: lineContent, promotedTodoId: 'todo-existing' }],
        save: vi.fn(),
      }
      ScratchNote.findById.mockResolvedValue(note)

      const app = createApp()
      const res = await request(app)
        .post('/api/scratch-notes/note-1/promote')
        .send({ lineId: 'line-1' })

      expect(res.status).toBe(400)
      expect(Todo.create).not.toHaveBeenCalled()
    })

    it('rejects a missing lineId', async () => {
      const app = createApp()
      const res = await request(app).post('/api/scratch-notes/note-1/promote').send({})

      expect(res.status).toBe(400)
      expect(ScratchNote.findById).not.toHaveBeenCalled()
    })

    it('returns 404 when the note does not exist', async () => {
      ScratchNote.findById.mockResolvedValue(null)

      const app = createApp()
      const res = await request(app)
        .post('/api/scratch-notes/does-not-exist/promote')
        .send({ lineId: 'line-1' })

      expect(res.status).toBe(404)
    })

    it('returns 404 when the line does not exist on the note', async () => {
      ScratchNote.findById.mockResolvedValue({ _id: 'note-1', body: [] })

      const app = createApp()
      const res = await request(app)
        .post('/api/scratch-notes/note-1/promote')
        .send({ lineId: 'does-not-exist' })

      expect(res.status).toBe(404)
    })
  })
})
