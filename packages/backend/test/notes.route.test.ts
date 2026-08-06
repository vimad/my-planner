import request from 'supertest'
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'

// The mocked shape mirrors the vi.mock factory below, not the real
// mongoose.Model<NoteDoc> type — these are plain vi.fn() stubs at runtime,
// so typing them as Mock (rather than fighting Mongoose's real
// static-method overloads) is the honest contract here, same as
// categories.route.test.ts.
interface MockedNoteModel {
  find: Mock
  create: Mock
  findOneAndUpdate: Mock
  findByIdAndDelete: Mock
  findOne: Mock
}

interface MockedNoteFolderModel {
  findOne: Mock
}

vi.mock('../src/models/Note.ts', () => {
  return {
    Note: {
      find: vi.fn(),
      create: vi.fn(),
      findOneAndUpdate: vi.fn(),
      findByIdAndDelete: vi.fn(),
      findOne: vi.fn(),
    },
  }
})

vi.mock('../src/models/NoteFolder.ts', () => {
  return {
    NoteFolder: {
      findOne: vi.fn(),
    },
  }
})

const { Note } = (await import('../src/models/Note.ts')) as unknown as {
  Note: MockedNoteModel
}
const { NoteFolder } = (await import('../src/models/NoteFolder.ts')) as unknown as {
  NoteFolder: MockedNoteFolderModel
}
const { createApp } = await import('../src/app.ts')

describe('Note routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('POST /api/notes', () => {
    it('creates a note attached to the given profileId', async () => {
      Note.create.mockResolvedValue({
        _id: '1',
        name: 'Recipe',
        folderId: null,
        body: null,
        profileId: 'p1',
      })

      const app = createApp()
      const res = await request(app)
        .post('/api/notes')
        .send({ name: 'Recipe', folderId: null, profileId: 'p1' })

      expect(res.status).toBe(201)
      expect(res.body).toEqual({ _id: '1', name: 'Recipe', folderId: null, body: null, profileId: 'p1' })
      expect(Note.create).toHaveBeenCalledWith({ name: 'Recipe', folderId: null, profileId: 'p1', body: null })
    })

    it('creates a root-level note when folderId is omitted', async () => {
      Note.create.mockResolvedValue({ _id: '1', name: 'Root note', folderId: null, profileId: 'p1' })

      const app = createApp()
      const res = await request(app).post('/api/notes').send({ name: 'Root note', profileId: 'p1' })

      expect(res.status).toBe(201)
      expect(Note.create).toHaveBeenCalledWith({ name: 'Root note', folderId: null, profileId: 'p1', body: null })
    })

    it('seeds body content when provided (capture-bar quick note flow)', async () => {
      const doc = { type: 'doc', content: [{ type: 'paragraph' }] }
      Note.create.mockResolvedValue({ _id: '1', name: 'Quick note', folderId: null, body: doc, profileId: 'p1' })

      const app = createApp()
      const res = await request(app)
        .post('/api/notes')
        .send({ name: 'Quick note', profileId: 'p1', body: doc })

      expect(res.status).toBe(201)
      expect(Note.create).toHaveBeenCalledWith({ name: 'Quick note', folderId: null, profileId: 'p1', body: doc })
    })

    it('rejects a folderId belonging to another profile (404, not silently linked)', async () => {
      NoteFolder.findOne.mockResolvedValue(null)

      const app = createApp()
      const res = await request(app)
        .post('/api/notes')
        .send({ name: 'Recipe', folderId: 'other-profile-folder', profileId: 'p1' })

      expect(res.status).toBe(404)
      expect(res.body).toEqual({ error: 'Folder not found' })
      expect(NoteFolder.findOne).toHaveBeenCalledWith({ _id: 'other-profile-folder', profileId: 'p1' })
      expect(Note.create).not.toHaveBeenCalled()
    })

    it('rejects a missing name', async () => {
      const app = createApp()
      const res = await request(app).post('/api/notes').send({ profileId: 'p1' })

      expect(res.status).toBe(400)
      expect(Note.create).not.toHaveBeenCalled()
    })

    it('rejects a missing profileId', async () => {
      const app = createApp()
      const res = await request(app).post('/api/notes').send({ name: 'Recipe' })

      expect(res.status).toBe(400)
      expect(res.body).toEqual({ error: 'profileId is required' })
      expect(Note.create).not.toHaveBeenCalled()
    })
  })

  describe('GET /api/notes', () => {
    it("lists a profile's notes", async () => {
      const docs = [
        { _id: '1', name: 'Recipe', folderId: null, profileId: 'p1' },
        { _id: '2', name: 'Journal', folderId: 'f1', profileId: 'p1' },
      ]
      Note.find.mockReturnValue({ sort: vi.fn().mockResolvedValue(docs) })

      const app = createApp()
      const res = await request(app).get('/api/notes').query({ profileId: 'p1' })

      expect(res.status).toBe(200)
      expect(Note.find).toHaveBeenCalledWith({ profileId: 'p1' })
      expect(res.body).toEqual(docs)
    })

    it('rejects a missing profileId', async () => {
      const app = createApp()
      const res = await request(app).get('/api/notes')

      expect(res.status).toBe(400)
      expect(res.body).toEqual({ error: 'profileId is required' })
      expect(Note.find).not.toHaveBeenCalled()
    })

    it("never returns another profile's notes", async () => {
      Note.find.mockReturnValue({ sort: vi.fn().mockResolvedValue([]) })

      const app = createApp()
      const resA = await request(app).get('/api/notes').query({ profileId: 'profile-a' })
      const resB = await request(app).get('/api/notes').query({ profileId: 'profile-b' })

      expect(resA.status).toBe(200)
      expect(resB.status).toBe(200)
      expect(Note.find).toHaveBeenNthCalledWith(1, { profileId: 'profile-a' })
      expect(Note.find).toHaveBeenNthCalledWith(2, { profileId: 'profile-b' })
    })
  })

  describe('GET /api/notes/search', () => {
    it('matches by name (case-insensitive), scoped to the given profile', async () => {
      const docs = [{ _id: 'n1', name: 'Recipe Book', profileId: 'p1' }]
      const limit = vi.fn().mockResolvedValue(docs)
      Note.find.mockReturnValue({ sort: vi.fn().mockReturnValue({ limit }) })

      const app = createApp()
      const res = await request(app).get('/api/notes/search').query({ q: 'recipe', profileId: 'p1' })

      expect(res.status).toBe(200)
      expect(res.body).toEqual(docs)
      expect(Note.find).toHaveBeenCalledWith({ profileId: 'p1', name: { $regex: 'recipe', $options: 'i' } })
      expect(limit).toHaveBeenCalledWith(6)
    })

    it('returns the profile\'s notes unfiltered when q is missing or empty', async () => {
      const docs = [{ _id: 'n1' }, { _id: 'n2' }]
      const limit = vi.fn().mockResolvedValue(docs)
      Note.find.mockReturnValue({ sort: vi.fn().mockReturnValue({ limit }) })

      const app = createApp()
      const res = await request(app).get('/api/notes/search').query({ q: '', profileId: 'p1' })

      expect(res.status).toBe(200)
      expect(res.body).toEqual(docs)
      expect(Note.find).toHaveBeenCalledWith({ profileId: 'p1' })
    })

    it('excludes excludeIds via $nin before the cap is applied', async () => {
      const limit = vi.fn().mockResolvedValue([])
      Note.find.mockReturnValue({ sort: vi.fn().mockReturnValue({ limit }) })

      const app = createApp()
      const res = await request(app)
        .get('/api/notes/search')
        .query({ profileId: 'p1', excludeIds: 'n1,n2' })

      expect(res.status).toBe(200)
      expect(Note.find).toHaveBeenCalledWith({ profileId: 'p1', _id: { $nin: ['n1', 'n2'] } })
    })

    it('caps results to 6, sorted by createdAt descending', async () => {
      const limit = vi.fn().mockResolvedValue([])
      const sort = vi.fn().mockReturnValue({ limit })
      Note.find.mockReturnValue({ sort })

      const app = createApp()
      await request(app).get('/api/notes/search').query({ profileId: 'p1' })

      expect(sort).toHaveBeenCalledWith({ createdAt: -1 })
      expect(limit).toHaveBeenCalledWith(6)
    })

    it('rejects a missing profileId', async () => {
      const app = createApp()
      const res = await request(app).get('/api/notes/search').query({ q: 'recipe' })

      expect(res.status).toBe(400)
      expect(res.body).toEqual({ error: 'profileId is required' })
      expect(Note.find).not.toHaveBeenCalled()
    })

    it('is not swallowed by the /:id-shaped routes (route ordering)', async () => {
      const limit = vi.fn().mockResolvedValue([])
      Note.find.mockReturnValue({ sort: vi.fn().mockReturnValue({ limit }) })

      const app = createApp()
      const res = await request(app).get('/api/notes/search').query({ profileId: 'p1' })

      expect(res.status).toBe(200)
      // If /:id had matched first, Note.findOne would be hit instead (via
      // the PATCH/DELETE handlers' ownership check) rather than Note.find.
      expect(Note.find).toHaveBeenCalled()
      expect(Note.findOne).not.toHaveBeenCalled()
    })
  })

  describe('PATCH /api/notes/:id', () => {
    it('renames a note', async () => {
      Note.findOneAndUpdate.mockResolvedValue({ _id: '2', name: 'New Name' })

      const app = createApp()
      const res = await request(app).patch('/api/notes/2').query({ profileId: 'p1' }).send({ name: 'New Name' })

      expect(res.status).toBe(200)
      expect(res.body.name).toBe('New Name')
      expect(Note.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: '2', profileId: 'p1' },
        { name: 'New Name' },
        { new: true },
      )
    })

    it('moves a note to another folder', async () => {
      NoteFolder.findOne.mockResolvedValue({ _id: 'f2', name: 'Target', parentId: null, profileId: 'p1' })
      Note.findOneAndUpdate.mockResolvedValue({ _id: '2', folderId: 'f2' })

      const app = createApp()
      const res = await request(app).patch('/api/notes/2').query({ profileId: 'p1' }).send({ folderId: 'f2' })

      expect(res.status).toBe(200)
      expect(NoteFolder.findOne).toHaveBeenCalledWith({ _id: 'f2', profileId: 'p1' })
      expect(Note.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: '2', profileId: 'p1' },
        { folderId: 'f2' },
        { new: true },
      )
    })

    it('rejects moving a note to a folderId belonging to another profile (404, not silently linked)', async () => {
      NoteFolder.findOne.mockResolvedValue(null)

      const app = createApp()
      const res = await request(app)
        .patch('/api/notes/2')
        .query({ profileId: 'p1' })
        .send({ folderId: 'other-profile-folder' })

      expect(res.status).toBe(404)
      expect(res.body).toEqual({ error: 'Folder not found' })
      expect(NoteFolder.findOne).toHaveBeenCalledWith({ _id: 'other-profile-folder', profileId: 'p1' })
      expect(Note.findOneAndUpdate).not.toHaveBeenCalled()
    })

    it('moves a note to root via folderId: null', async () => {
      Note.findOneAndUpdate.mockResolvedValue({ _id: '2', folderId: null })

      const app = createApp()
      const res = await request(app).patch('/api/notes/2').query({ profileId: 'p1' }).send({ folderId: null })

      expect(res.status).toBe(200)
      expect(Note.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: '2', profileId: 'p1' },
        { folderId: null },
        { new: true },
      )
    })

    it('saves editor body content', async () => {
      const doc = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hi' }] }] }
      Note.findOneAndUpdate.mockResolvedValue({ _id: '2', body: doc })

      const app = createApp()
      const res = await request(app).patch('/api/notes/2').query({ profileId: 'p1' }).send({ body: doc })

      expect(res.status).toBe(200)
      expect(Note.findOneAndUpdate).toHaveBeenCalledWith({ _id: '2', profileId: 'p1' }, { body: doc }, { new: true })
    })

    it('rejects a missing profileId', async () => {
      const app = createApp()
      const res = await request(app).patch('/api/notes/2').send({ name: 'x' })

      expect(res.status).toBe(400)
      expect(Note.findOneAndUpdate).not.toHaveBeenCalled()
    })

    it('returns 404 when the note does not exist', async () => {
      Note.findOneAndUpdate.mockResolvedValue(null)

      const app = createApp()
      const res = await request(app).patch('/api/notes/does-not-exist').query({ profileId: 'p1' }).send({ name: 'x' })

      expect(res.status).toBe(404)
    })

    it('returns 404 when the note belongs to a different profile', async () => {
      Note.findOneAndUpdate.mockResolvedValue(null)

      const app = createApp()
      const res = await request(app)
        .patch('/api/notes/2')
        .query({ profileId: 'profile-b' })
        .send({ name: 'Hijacked' })

      expect(res.status).toBe(404)
      expect(Note.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: '2', profileId: 'profile-b' },
        { name: 'Hijacked' },
        { new: true },
      )
    })
  })

  describe('DELETE /api/notes/:id', () => {
    it('deletes a note', async () => {
      Note.findOne.mockResolvedValue({ _id: '2', name: 'Recipe' })
      Note.findByIdAndDelete.mockResolvedValue({ _id: '2' })

      const app = createApp()
      const res = await request(app).delete('/api/notes/2').query({ profileId: 'p1' })

      expect(res.status).toBe(204)
      expect(Note.findOne).toHaveBeenCalledWith({ _id: '2', profileId: 'p1' })
      expect(Note.findByIdAndDelete).toHaveBeenCalledWith('2')
    })

    it('rejects a missing profileId', async () => {
      const app = createApp()
      const res = await request(app).delete('/api/notes/2')

      expect(res.status).toBe(400)
      expect(Note.findOne).not.toHaveBeenCalled()
    })

    it('returns 404 when the note does not exist', async () => {
      Note.findOne.mockResolvedValue(null)

      const app = createApp()
      const res = await request(app).delete('/api/notes/does-not-exist').query({ profileId: 'p1' })

      expect(res.status).toBe(404)
    })

    it('returns 404 when the note belongs to a different profile', async () => {
      Note.findOne.mockResolvedValue(null)

      const app = createApp()
      const res = await request(app).delete('/api/notes/2').query({ profileId: 'profile-b' })

      expect(res.status).toBe(404)
      expect(Note.findOne).toHaveBeenCalledWith({ _id: '2', profileId: 'profile-b' })
      expect(Note.findByIdAndDelete).not.toHaveBeenCalled()
    })
  })
})
