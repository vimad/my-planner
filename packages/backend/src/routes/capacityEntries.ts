import { Router, type NextFunction, type Request, type Response } from 'express'
import { CapacityEntry } from '../models/CapacityEntry.ts'
import { isDuplicateKeyError } from '../utils/mongoErrors.ts'

export const capacityEntriesRouter = Router()

// Request body shape for create/update — client-supplied and unvalidated, so
// fields are optional here even though the model requires most of them; the
// handlers below enforce presence before writing.
interface CapacityEntryBody {
  teamMembershipId?: string
  sprintId?: string
  leaveDays?: number
}

// POST /api/capacity-entries -> record a membership's leave for a sprint.
// Rejects a duplicate (teamMembershipId, sprintId) pair with 409 — enforced
// by the model's unique compound index.
capacityEntriesRouter.post(
  '/',
  async (req: Request<Record<string, never>, unknown, CapacityEntryBody>, res: Response, next: NextFunction) => {
    try {
      const { teamMembershipId, sprintId, leaveDays } = req.body

      if (!teamMembershipId || !sprintId) {
        return res.status(400).json({ error: 'teamMembershipId and sprintId are required' })
      }

      const entry = await CapacityEntry.create({ teamMembershipId, sprintId, leaveDays: leaveDays ?? 0 })
      res.status(201).json(entry)
    } catch (err) {
      if (isDuplicateKeyError(err)) {
        return res.status(409).json({ error: 'A capacity entry already exists for this membership and sprint' })
      }
      next(err)
    }
  },
)

// GET /api/capacity-entries?teamMembershipId=&sprintId= -> the single entry
// for that pair, or 404 if no leave has been entered yet.
capacityEntriesRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { teamMembershipId, sprintId } = req.query

    if (!teamMembershipId || typeof teamMembershipId !== 'string' || !sprintId || typeof sprintId !== 'string') {
      return res.status(400).json({ error: 'teamMembershipId and sprintId are required' })
    }

    const entry = await CapacityEntry.findOne({ teamMembershipId, sprintId })
    if (!entry) {
      return res.status(404).json({ error: 'Capacity entry not found' })
    }

    res.json(entry)
  } catch (err) {
    next(err)
  }
})

// PATCH /api/capacity-entries/:id -> edit leaveDays.
capacityEntriesRouter.patch(
  '/:id',
  async (req: Request<{ id: string }, unknown, CapacityEntryBody>, res: Response, next: NextFunction) => {
    try {
      const { leaveDays } = req.body

      if (typeof leaveDays !== 'number') {
        return res.status(400).json({ error: 'leaveDays must be a number' })
      }

      const entry = await CapacityEntry.findByIdAndUpdate(req.params.id, { leaveDays }, { returnDocument: 'after' })

      if (!entry) {
        return res.status(404).json({ error: 'Capacity entry not found' })
      }

      res.json(entry)
    } catch (err) {
      next(err)
    }
  },
)
