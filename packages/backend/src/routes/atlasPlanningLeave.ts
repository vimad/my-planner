import { Router, type NextFunction, type Request, type Response } from 'express'
import { AtlasPlanningLeave, type AtlasPlanningLeavePortion } from '../models/AtlasPlanningLeave.ts'
import { computeRollingWindowDates } from '../utils/rollingWindow.ts'
import { isDuplicateKeyError } from '../utils/mongoErrors.ts'

export const atlasPlanningLeaveRouter = Router()

const DATE_SHAPE = /^\d{4}-\d{2}-\d{2}$/

function isValidPortion(value: unknown): value is AtlasPlanningLeavePortion {
  return value === 'full' || value === 'half'
}

interface CreateLeaveBody {
  rosterMemberId?: string
  date?: string
  portion?: AtlasPlanningLeavePortion
}

// POST /api/atlas-planning-leave -> marks a roster member on leave for one
// date (.scratch/atlas-planning-tab, ticket 02). Only ever called by the
// leave grid's cell click when that cell currently has no mark ("none" ->
// "full" of the click-to-cycle interaction) - a full<->half change on an
// already-marked cell goes through PATCH, not a second POST, since
// (rosterMemberId, date) is unique. A same-cell race (e.g. a double click
// beating the client's own state update) surfaces as 409 via the model's
// real unique index, not a pre-check findOne.
atlasPlanningLeaveRouter.post(
  '/',
  async (req: Request<Record<string, never>, unknown, CreateLeaveBody>, res: Response, next: NextFunction) => {
    try {
      const rosterMemberId = req.body.rosterMemberId?.trim()
      const date = req.body.date?.trim()
      const { portion } = req.body

      if (!rosterMemberId) {
        return res.status(400).json({ error: 'rosterMemberId is required' })
      }
      if (!date || !DATE_SHAPE.test(date)) {
        return res.status(400).json({ error: 'date is required and must be a YYYY-MM-DD string' })
      }
      if (!isValidPortion(portion)) {
        return res.status(400).json({ error: 'portion must be "full" or "half"' })
      }

      const entry = await AtlasPlanningLeave.create({ rosterMemberId, date, portion })
      res.status(201).json(entry)
    } catch (err) {
      if (isDuplicateKeyError(err)) {
        return res.status(409).json({ error: 'This person already has a leave mark for that date' })
      }
      next(err)
    }
  },
)

// GET /api/atlas-planning-leave -> every leave mark whose date currently
// falls within the rolling two-week window ("today" through "today + 13
// days" as of this request). Read-time reconciliation, not a cascade
// delete: a mark whose date has aged out of the window simply isn't
// returned any more - the document itself is left untouched in storage, so
// it starts showing again if "today" were ever to move backwards (it never
// does in practice, but nothing here relies on that).
atlasPlanningLeaveRouter.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const windowDates = computeRollingWindowDates()
    const entries = await AtlasPlanningLeave.find({ date: { $in: windowDates } }).sort({ date: 1 })
    res.json(entries)
  } catch (err) {
    next(err)
  }
})

interface UpdateLeaveBody {
  portion?: AtlasPlanningLeavePortion
}

// PATCH /api/atlas-planning-leave/:id -> changes an already-marked cell's
// portion ("full" -> "half" of the click-to-cycle interaction).
atlasPlanningLeaveRouter.patch(
  '/:id',
  async (req: Request<{ id: string }, unknown, UpdateLeaveBody>, res: Response, next: NextFunction) => {
    try {
      if (!isValidPortion(req.body.portion)) {
        return res.status(400).json({ error: 'portion must be "full" or "half"' })
      }

      const entry = await AtlasPlanningLeave.findByIdAndUpdate(
        req.params.id,
        { portion: req.body.portion },
        { returnDocument: 'after', runValidators: true },
      )

      if (!entry) {
        return res.status(404).json({ error: 'Leave mark not found' })
      }

      res.json(entry)
    } catch (err) {
      next(err)
    }
  },
)

// DELETE /api/atlas-planning-leave/:id -> clears a cell's mark ("half" ->
// "none" of the click-to-cycle interaction). A hard delete - there's no
// soft-delete/archive concept here.
atlasPlanningLeaveRouter.delete('/:id', async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
  try {
    const entry = await AtlasPlanningLeave.findByIdAndDelete(req.params.id)

    if (!entry) {
      return res.status(404).json({ error: 'Leave mark not found' })
    }

    res.status(204).end()
  } catch (err) {
    next(err)
  }
})
