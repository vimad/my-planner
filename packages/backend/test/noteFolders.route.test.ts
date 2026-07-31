import request from 'supertest'
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'

// The mocked shapes mirror the vi.mock factories below, not the real
// mongoose.Model<...> types — these are plain vi.fn() stubs at runtime, so
// typing them as Mock (rather than fighting Mongoose's real static-method
// overloads) is the honest contract here, same as categories.route.test.ts.
interface MockedNoteFolderModel {
  find: Mock
  create: Mock
  findOneAndUpdate: Mock
  findOne: Mock
  deleteMany: Mock
}

interface MockedNoteModel {
  deleteMany: Mock
}

vi.mock('../src/models/NoteFolder.ts', () => {
  return {
    NoteFolder: {
      find: vi.fn(),
      create: vi.fn(),
      findOneAndUpdate: vi.fn(),
      findOne: vi.fn(),
      deleteMany: vi.fn(),
    },
  }
})

vi.mock('../src/models/Note.ts', () => {
  return {
    Note: {
      deleteMany: vi.fn(),
    },
  }
})

const { NoteFolder } = (await import('../src/models/NoteFolder.ts')) as unknown as {
  NoteFolder: MockedNoteFolderModel
}
const { Note } = (await import('../src/models/Note.ts')) as unknown as {
  Note: MockedNoteModel
}
const { createApp } = await import('../src/app.ts')

describe('NoteFolder routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('POST /api/note-folders', () => {
    it('creates a folder attached to the given profileId', async () => {
      NoteFolder.create.mockResolvedValue({
        _id: '1',
        name: 'Recipes',
        parentId: null,
        profileId: 'p1',
      })

      const app = createApp()
      const res = await request(app)
        .post('/api/note-folders')
        .send({ name: 'Recipes', parentId: null, profileId: 'p1' })

      expect(res.status).toBe(201)
      expect(res.body).toEqual({ _id: '1', name: 'Recipes', parentId: null, profileId: 'p1' })
      expect(NoteFolder.create).toHaveBeenCalledWith({ name: 'Recipes', parentId: null, profileId: 'p1' })
    })

    it('creates a root-level folder when parentId is omitted', async () => {
      NoteFolder.create.mockResolvedValue({ _id: '1', name: 'Recipes', parentId: null, profileId: 'p1' })

      const app = createApp()
      const res = await request(app).post('/api/note-folders').send({ name: 'Recipes', profileId: 'p1' })

      expect(res.status).toBe(201)
      expect(NoteFolder.create).toHaveBeenCalledWith({ name: 'Recipes', parentId: null, profileId: 'p1' })
    })

    it('creates a nested folder given a parentId', async () => {
      NoteFolder.findOne.mockResolvedValue({ _id: '1', name: 'Recipes', parentId: null, profileId: 'p1' })
      NoteFolder.create.mockResolvedValue({ _id: '2', name: 'Desserts', parentId: '1', profileId: 'p1' })

      const app = createApp()
      const res = await request(app)
        .post('/api/note-folders')
        .send({ name: 'Desserts', parentId: '1', profileId: 'p1' })

      expect(res.status).toBe(201)
      expect(NoteFolder.findOne).toHaveBeenCalledWith({ _id: '1', profileId: 'p1' })
      expect(NoteFolder.create).toHaveBeenCalledWith({ name: 'Desserts', parentId: '1', profileId: 'p1' })
    })

    it('rejects a parentId belonging to another profile (404, not silently linked)', async () => {
      NoteFolder.findOne.mockResolvedValue(null)

      const app = createApp()
      const res = await request(app)
        .post('/api/note-folders')
        .send({ name: 'Desserts', parentId: 'other-profile-folder', profileId: 'p1' })

      expect(res.status).toBe(404)
      expect(res.body).toEqual({ error: 'Parent folder not found' })
      expect(NoteFolder.findOne).toHaveBeenCalledWith({ _id: 'other-profile-folder', profileId: 'p1' })
      expect(NoteFolder.create).not.toHaveBeenCalled()
    })

    it('rejects a missing name', async () => {
      const app = createApp()
      const res = await request(app).post('/api/note-folders').send({ profileId: 'p1' })

      expect(res.status).toBe(400)
      expect(NoteFolder.create).not.toHaveBeenCalled()
    })

    it('rejects a missing profileId', async () => {
      const app = createApp()
      const res = await request(app).post('/api/note-folders').send({ name: 'Recipes' })

      expect(res.status).toBe(400)
      expect(res.body).toEqual({ error: 'profileId is required' })
      expect(NoteFolder.create).not.toHaveBeenCalled()
    })
  })

  describe('GET /api/note-folders', () => {
    it("lists a profile's folders, flat", async () => {
      const docs = [
        { _id: '1', name: 'Recipes', parentId: null, profileId: 'p1' },
        { _id: '2', name: 'Desserts', parentId: '1', profileId: 'p1' },
      ]
      NoteFolder.find.mockReturnValue({ sort: vi.fn().mockResolvedValue(docs) })

      const app = createApp()
      const res = await request(app).get('/api/note-folders').query({ profileId: 'p1' })

      expect(res.status).toBe(200)
      expect(NoteFolder.find).toHaveBeenCalledWith({ profileId: 'p1' })
      expect(res.body).toEqual(docs)
    })

    it('rejects a missing profileId', async () => {
      const app = createApp()
      const res = await request(app).get('/api/note-folders')

      expect(res.status).toBe(400)
      expect(res.body).toEqual({ error: 'profileId is required' })
      expect(NoteFolder.find).not.toHaveBeenCalled()
    })

    it("never returns another profile's folders", async () => {
      NoteFolder.find.mockReturnValue({ sort: vi.fn().mockResolvedValue([]) })

      const app = createApp()
      const resA = await request(app).get('/api/note-folders').query({ profileId: 'profile-a' })
      const resB = await request(app).get('/api/note-folders').query({ profileId: 'profile-b' })

      expect(resA.status).toBe(200)
      expect(resB.status).toBe(200)
      expect(NoteFolder.find).toHaveBeenNthCalledWith(1, { profileId: 'profile-a' })
      expect(NoteFolder.find).toHaveBeenNthCalledWith(2, { profileId: 'profile-b' })
    })
  })

  describe('PATCH /api/note-folders/:id', () => {
    it('renames a folder', async () => {
      NoteFolder.findOneAndUpdate.mockResolvedValue({ _id: '2', name: 'New Name' })

      const app = createApp()
      const res = await request(app)
        .patch('/api/note-folders/2')
        .query({ profileId: 'p1' })
        .send({ name: 'New Name' })

      expect(res.status).toBe(200)
      expect(res.body.name).toBe('New Name')
      expect(NoteFolder.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: '2', profileId: 'p1' },
        { name: 'New Name' },
        { new: true },
      )
    })

    it('reparents a folder', async () => {
      // Target parent (folder 3) is owned by the same profile and has no
      // children of its own, so both the ownership check and the
      // reparent-cycle check pass.
      NoteFolder.findOne.mockResolvedValue({ _id: '3', name: 'Target', parentId: null, profileId: 'p1' })
      NoteFolder.find.mockResolvedValueOnce([])
      NoteFolder.findOneAndUpdate.mockResolvedValue({ _id: '2', parentId: '3' })

      const app = createApp()
      const res = await request(app).patch('/api/note-folders/2').query({ profileId: 'p1' }).send({ parentId: '3' })

      expect(res.status).toBe(200)
      expect(NoteFolder.findOne).toHaveBeenCalledWith({ _id: '3', profileId: 'p1' })
      expect(NoteFolder.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: '2', profileId: 'p1' },
        { parentId: '3' },
        { new: true },
      )
    })

    it('rejects reparenting into a parentId belonging to another profile (404, not silently linked)', async () => {
      NoteFolder.findOne.mockResolvedValue(null)

      const app = createApp()
      const res = await request(app)
        .patch('/api/note-folders/2')
        .query({ profileId: 'p1' })
        .send({ parentId: 'other-profile-folder' })

      expect(res.status).toBe(404)
      expect(res.body).toEqual({ error: 'Parent folder not found' })
      expect(NoteFolder.findOne).toHaveBeenCalledWith({ _id: 'other-profile-folder', profileId: 'p1' })
      expect(NoteFolder.findOneAndUpdate).not.toHaveBeenCalled()
    })

    it('rejects reparenting a folder into itself (400)', async () => {
      NoteFolder.findOne.mockResolvedValue({ _id: '2', name: 'Self', parentId: null, profileId: 'p1' })
      NoteFolder.find.mockResolvedValueOnce([])

      const app = createApp()
      const res = await request(app).patch('/api/note-folders/2').query({ profileId: 'p1' }).send({ parentId: '2' })

      expect(res.status).toBe(400)
      expect(res.body).toEqual({ error: 'Cannot move a folder into itself or one of its own descendants' })
      expect(NoteFolder.findOneAndUpdate).not.toHaveBeenCalled()
    })

    it("rejects reparenting a folder into its own descendant (400)", async () => {
      // Fixture: folder 2 (the one being reparented) has child folder 3,
      // and the request tries to move folder 2 under folder 3.
      NoteFolder.findOne.mockResolvedValue({ _id: '3', name: 'Child', parentId: '2', profileId: 'p1' })
      NoteFolder.find.mockResolvedValueOnce([{ _id: '3' }]).mockResolvedValueOnce([])

      const app = createApp()
      const res = await request(app).patch('/api/note-folders/2').query({ profileId: 'p1' }).send({ parentId: '3' })

      expect(res.status).toBe(400)
      expect(res.body).toEqual({ error: 'Cannot move a folder into itself or one of its own descendants' })
      expect(NoteFolder.findOneAndUpdate).not.toHaveBeenCalled()
    })

    it('moves a folder to root via parentId: null', async () => {
      NoteFolder.findOneAndUpdate.mockResolvedValue({ _id: '2', parentId: null })

      const app = createApp()
      const res = await request(app)
        .patch('/api/note-folders/2')
        .query({ profileId: 'p1' })
        .send({ parentId: null })

      expect(res.status).toBe(200)
      expect(NoteFolder.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: '2', profileId: 'p1' },
        { parentId: null },
        { new: true },
      )
    })

    it('rejects a missing profileId', async () => {
      const app = createApp()
      const res = await request(app).patch('/api/note-folders/2').send({ name: 'x' })

      expect(res.status).toBe(400)
      expect(NoteFolder.findOneAndUpdate).not.toHaveBeenCalled()
    })

    it('returns 404 when the folder does not exist', async () => {
      NoteFolder.findOneAndUpdate.mockResolvedValue(null)

      const app = createApp()
      const res = await request(app)
        .patch('/api/note-folders/does-not-exist')
        .query({ profileId: 'p1' })
        .send({ name: 'x' })

      expect(res.status).toBe(404)
    })

    it('returns 404 when the folder belongs to a different profile', async () => {
      NoteFolder.findOneAndUpdate.mockResolvedValue(null)

      const app = createApp()
      const res = await request(app)
        .patch('/api/note-folders/2')
        .query({ profileId: 'profile-b' })
        .send({ name: 'Hijacked' })

      expect(res.status).toBe(404)
      expect(NoteFolder.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: '2', profileId: 'profile-b' },
        { name: 'Hijacked' },
        { new: true },
      )
    })
  })

  describe('DELETE /api/note-folders/:id', () => {
    it('cascade-deletes a multi-level nested fixture: descendant folders and every note within them', async () => {
      // Fixture: folder A (root) -> folder B -> folder C, each with its own
      // note (noteA/noteB/noteC). collectFolderIdsInSubtree walks the tree
      // breadth-first via repeated NoteFolder.find calls, so each call below
      // corresponds to one level of the walk: children of A, then children
      // of B, then children of C (empty - bottom of the tree).
      NoteFolder.findOne.mockResolvedValue({ _id: 'A', name: 'A', parentId: null, profileId: 'p1' })
      NoteFolder.find
        .mockResolvedValueOnce([{ _id: 'B' }])
        .mockResolvedValueOnce([{ _id: 'C' }])
        .mockResolvedValueOnce([])
      Note.deleteMany.mockResolvedValue({ deletedCount: 3 })
      NoteFolder.deleteMany.mockResolvedValue({ deletedCount: 3 })

      const app = createApp()
      const res = await request(app).delete('/api/note-folders/A').query({ profileId: 'p1' })

      expect(res.status).toBe(204)
      expect(NoteFolder.findOne).toHaveBeenCalledWith({ _id: 'A', profileId: 'p1' })
      expect(NoteFolder.find).toHaveBeenNthCalledWith(1, { parentId: { $in: ['A'] }, profileId: 'p1' }, { _id: 1 })
      expect(NoteFolder.find).toHaveBeenNthCalledWith(2, { parentId: { $in: ['B'] }, profileId: 'p1' }, { _id: 1 })
      expect(NoteFolder.find).toHaveBeenNthCalledWith(3, { parentId: { $in: ['C'] }, profileId: 'p1' }, { _id: 1 })
      expect(Note.deleteMany).toHaveBeenCalledWith({ folderId: { $in: ['A', 'B', 'C'] } })
      expect(NoteFolder.deleteMany).toHaveBeenCalledWith({ _id: { $in: ['A', 'B', 'C'] } })
    })

    it('deletes a leaf folder (no descendants) and its own notes only', async () => {
      NoteFolder.findOne.mockResolvedValue({ _id: 'C', name: 'C', parentId: 'B', profileId: 'p1' })
      NoteFolder.find.mockResolvedValueOnce([])
      Note.deleteMany.mockResolvedValue({ deletedCount: 1 })
      NoteFolder.deleteMany.mockResolvedValue({ deletedCount: 1 })

      const app = createApp()
      const res = await request(app).delete('/api/note-folders/C').query({ profileId: 'p1' })

      expect(res.status).toBe(204)
      expect(Note.deleteMany).toHaveBeenCalledWith({ folderId: { $in: ['C'] } })
      expect(NoteFolder.deleteMany).toHaveBeenCalledWith({ _id: { $in: ['C'] } })
    })

    it('rejects a missing profileId', async () => {
      const app = createApp()
      const res = await request(app).delete('/api/note-folders/2')

      expect(res.status).toBe(400)
      expect(NoteFolder.findOne).not.toHaveBeenCalled()
    })

    it('returns 404 when the folder does not exist', async () => {
      NoteFolder.findOne.mockResolvedValue(null)

      const app = createApp()
      const res = await request(app).delete('/api/note-folders/does-not-exist').query({ profileId: 'p1' })

      expect(res.status).toBe(404)
      expect(Note.deleteMany).not.toHaveBeenCalled()
      expect(NoteFolder.deleteMany).not.toHaveBeenCalled()
    })

    it('returns 404 when the folder belongs to a different profile', async () => {
      NoteFolder.findOne.mockResolvedValue(null)

      const app = createApp()
      const res = await request(app).delete('/api/note-folders/2').query({ profileId: 'profile-b' })

      expect(res.status).toBe(404)
      expect(NoteFolder.findOne).toHaveBeenCalledWith({ _id: '2', profileId: 'profile-b' })
      expect(NoteFolder.deleteMany).not.toHaveBeenCalled()
    })
  })
})
