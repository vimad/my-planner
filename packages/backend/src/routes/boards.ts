import { Router, type NextFunction, type Request, type Response } from 'express'
import { Board, type BoardDoc, type BoardItem } from '../models/Board.ts'
import { Profile } from '../models/Profile.ts'
import { requireProfileId } from '../utils/profileScope.ts'

export const boardsRouter = Router()

// Request body shape for create/update — client-supplied and unvalidated, so
// fields are optional here even though the model requires `name`/`profileId`;
// the handlers below enforce presence before writing.
interface BoardBody {
  name?: string
  profileId?: string
  items?: BoardItem[]
}

// POST /api/boards -> create an empty board attached to the given profileId.
// profileId is required in the body (not resolved server-side) — same
// reasoning as POST /api/categories and POST /api/notes: there's no
// server-side "active profile" concept, so the client is the only party
// that has it in hand.
boardsRouter.post(
  '/',
  async (req: Request<Record<string, never>, unknown, BoardBody>, res: Response, next: NextFunction) => {
    try {
      const { name } = req.body

      if (!name) {
        return res.status(400).json({ error: 'name is required' })
      }

      const profileId = requireProfileId(req.body.profileId, res)
      if (!profileId) return

      const board = await Board.create({ name, profileId })
      res.status(201).json(board)
    } catch (err) {
      next(err)
    }
  },
)

// GET /api/boards?profileId=... -> lists a profile's boards (items embedded),
// sorted by creation order — same convention as categories/profiles; boards
// themselves aren't manually reorderable. profileId is required so a caller
// can never accidentally see another profile's boards by omitting it.
boardsRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const profileId = requireProfileId(req.query.profileId, res)
    if (!profileId) return

    const boards = await Board.find({ profileId }).sort({ createdAt: 1 })
    res.json(boards)
  } catch (err) {
    next(err)
  }
})

// PATCH /api/boards/:id?profileId=... -> rename and/or whole-array `items`
// replace — one endpoint covers add/remove/reorder, exactly like
// Todo.linkedTodoIds: the frontend computes the new full array client-side
// and PATCHes it whole. profileId is required and checked against the
// board's own profileId (404, not 403, so a mismatch reveals nothing).
boardsRouter.patch(
  '/:id',
  async (
    req: Request<{ id: string }, unknown, BoardBody, { profileId?: string }>,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const profileId = requireProfileId(req.query.profileId, res)
      if (!profileId) return

      const { name, items } = req.body
      const update: Partial<BoardDoc> = {}
      if (name !== undefined) update.name = name
      if (items !== undefined) update.items = items

      const board = await Board.findOneAndUpdate({ _id: req.params.id, profileId }, update, {
        new: true,
      })

      if (!board) {
        return res.status(404).json({ error: 'Board not found' })
      }

      res.json(board)
    } catch (err) {
      next(err)
    }
  },
)

// DELETE /api/boards/:id?profileId=... -> delete a board only — no cascade,
// the todos/notes it referenced are untouched (see the no-cascade comment on
// Board.items). If the deleted board was the profile's active board,
// Profile.activeBoardId is updated too: the first remaining board in
// creation order if any remain, else null — the same "no active board" state
// a fresh profile starts in.
boardsRouter.delete(
  '/:id',
  async (req: Request<{ id: string }, unknown, unknown, { profileId?: string }>, res: Response, next: NextFunction) => {
    try {
      const profileId = requireProfileId(req.query.profileId, res)
      if (!profileId) return

      const board = await Board.findOne({ _id: req.params.id, profileId })

      if (!board) {
        return res.status(404).json({ error: 'Board not found' })
      }

      await Board.findByIdAndDelete(req.params.id)

      const profile = await Profile.findById(profileId)
      if (profile && String(profile.activeBoardId) === String(board._id)) {
        const nextBoard = await Board.findOne({ profileId }).sort({ createdAt: 1 })
        profile.activeBoardId = nextBoard ? nextBoard._id : null
        await profile.save()
      }

      res.status(204).end()
    } catch (err) {
      next(err)
    }
  },
)
