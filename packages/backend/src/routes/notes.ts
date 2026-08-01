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

// GET /api/notes/search?profileId=...&q=...&excludeIds=... -> powers the
// Boards "search to add" bar's note half only (the main app's todo-only
// search box, GET /api/todos/search, is untouched). Matches `name` only
// (not folder path, not body content) — case-insensitive substring, same
// regex-match pattern as todos/search. A missing/empty q returns the
// profile's notes unfiltered. excludeIds (comma-separated note ids) is
// filtered via $nin before the .limit(6) cap, so a full page of results
// comes back whenever that many matches exist. The server never resolves
// the active board itself — the client computes excludeIds from it — which
// keeps this file decoupled from Board/Profile (it already only imports
// NoteFolder, for validation). Must be registered before any /:id-shaped
// route so Express's param matcher doesn't swallow the literal "search"
// segment as an :id (same reason /tags/search precede /:id in todos.ts).
notesRouter.get(
  '/search',
  async (
    req: Request<Record<string, never>, unknown, unknown, { q?: string; profileId?: string; excludeIds?: string }>,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const profileId = requireProfileId(req.query.profileId, res)
      if (!profileId) return

      const q = typeof req.query.q === 'string' ? req.query.q.trim() : ''
      const excludeIds =
        typeof req.query.excludeIds === 'string' && req.query.excludeIds.length > 0
          ? req.query.excludeIds.split(',')
          : []

      const filter: Record<string, unknown> = { profileId }
      if (q) filter.name = { $regex: q, $options: 'i' }
      if (excludeIds.length > 0) filter._id = { $nin: excludeIds }

      const notes = await Note.find(filter).sort({ createdAt: -1 }).limit(6)
      res.json(notes)
    } catch (err) {
      next(err)
    }
  },
)

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
