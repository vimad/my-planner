import { Router, type NextFunction, type Request, type Response } from 'express'
import { Note } from '../models/Note.ts'
import { NoteFolder } from '../models/NoteFolder.ts'
import { requireProfileId } from '../utils/profileScope.ts'
import type { TiptapNode } from '../utils/tiptapText.ts'

export const notesRouter = Router()

// Request body shape for create/update — client-supplied and unvalidated,
// so fields are optional here even though the model requires `name`; the
// handlers below enforce presence before writing. `folderId` is nullable
// (root-level) throughout, so `null` is a meaningful value distinct from
// `undefined` ("not supplied") wherever it appears below.
interface NoteBody {
  name?: string
  folderId?: string | null
  body?: TiptapNode | null
  profileId?: string
}

// POST /api/notes -> create a note (with an empty body) attached to the
// given profileId. profileId is required in the body (not resolved
// server-side) - same reasoning as POST /api/categories: there's no
// server-side "active profile" concept, so the client is the only party
// that has it in hand.
notesRouter.post(
  '/',
  async (req: Request<Record<string, never>, unknown, NoteBody>, res: Response, next: NextFunction) => {
    try {
      const { name } = req.body

      if (!name) {
        return res.status(400).json({ error: 'name is required' })
      }

      const profileId = requireProfileId(req.body.profileId, res)
      if (!profileId) return

      const folderId = req.body.folderId ?? null

      // A non-null folderId must resolve to a folder owned by this same
      // profile - 404, not 403 (same convention as the profileId ownership
      // checks below), so a cross-profile id doesn't get silently linked in
      // as a note's folder.
      if (folderId !== null) {
        const folder = await NoteFolder.findOne({ _id: folderId, profileId })
        if (!folder) {
          return res.status(404).json({ error: 'Folder not found' })
        }
      }

      const note = await Note.create({ name, folderId, profileId })
      res.status(201).json(note)
    } catch (err) {
      next(err)
    }
  },
)

// GET /api/notes?profileId=... -> lists all of a profile's notes, flat.
// profileId is required so a caller can never accidentally see another
// profile's notes by omitting it.
notesRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const profileId = requireProfileId(req.query.profileId, res)
    if (!profileId) return

    const notes = await Note.find({ profileId }).sort({ createdAt: 1 })
    res.json(notes)
  } catch (err) {
    next(err)
  }
})

// PATCH /api/notes/:id?profileId=... -> rename, move (`folderId`, `null`
// for root), and/or save editor content (`body`) - one endpoint for all
// three, matching ScratchNote's single-PATCH-for-metadata-and-content
// pattern. profileId is required and checked against the note's own
// profileId (404, not 403) - mirrors PATCH /api/categories/:id.
notesRouter.patch(
  '/:id',
  async (
    req: Request<{ id: string }, unknown, NoteBody, { profileId?: string }>,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const profileId = requireProfileId(req.query.profileId, res)
      if (!profileId) return

      const { name, folderId, body } = req.body

      // A non-null folderId must resolve to a folder owned by this same
      // profile (same 404-not-403 convention as the profileId check above),
      // so a note can't be moved into a cross-profile folder.
      if (folderId !== undefined && folderId !== null) {
        const folder = await NoteFolder.findOne({ _id: folderId, profileId })
        if (!folder) {
          return res.status(404).json({ error: 'Folder not found' })
        }
      }

      const update: NoteBody = {}
      if (name !== undefined) update.name = name
      if (folderId !== undefined) update.folderId = folderId
      if (body !== undefined) update.body = body

      const note = await Note.findOneAndUpdate({ _id: req.params.id, profileId }, update, {
        new: true,
      })

      if (!note) {
        return res.status(404).json({ error: 'Note not found' })
      }

      res.json(note)
    } catch (err) {
      next(err)
    }
  },
)

// DELETE /api/notes/:id?profileId=... -> delete a single note. profileId is
// required and checked against the note's own profileId, same reasoning as
// PATCH above.
notesRouter.delete(
  '/:id',
  async (req: Request<{ id: string }, unknown, unknown, { profileId?: string }>, res: Response, next: NextFunction) => {
    try {
      const profileId = requireProfileId(req.query.profileId, res)
      if (!profileId) return

      const note = await Note.findOne({ _id: req.params.id, profileId })

      if (!note) {
        return res.status(404).json({ error: 'Note not found' })
      }

      await Note.findByIdAndDelete(req.params.id)
      res.status(204).end()
    } catch (err) {
      next(err)
    }
  },
)
