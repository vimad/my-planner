import { Router, type NextFunction, type Request, type Response } from 'express'
import { CapacityLookup } from '../models/CapacityLookup.ts'
import { isDuplicateKeyError } from '../utils/mongoErrors.ts'

export const capacityLookupRouter = Router()

// Request body shape for create/update — client-supplied and unvalidated, so
// fields are optional here even though the model requires them; the
// handlers below enforce presence before writing. This is the
// admin-editable settings-view data the capacity formula reads (ticket 17 or
// a later ticket owns the UI) — no code change needed to add/edit rows.
interface CapacityLookupBody {
  percentage?: number
  days?: number
  hours?: number
}

// POST /api/capacity-lookup -> add a row. Rejects a duplicate
// (percentage, days) pair with 409 — enforced by the model's unique
// compound index.
capacityLookupRouter.post(
  '/',
  async (req: Request<Record<string, never>, unknown, CapacityLookupBody>, res: Response, next: NextFunction) => {
    try {
      const { percentage, days, hours } = req.body

      if (typeof percentage !== 'number' || typeof days !== 'number' || typeof hours !== 'number') {
        return res.status(400).json({ error: 'percentage, days and hours are required' })
      }

      const row = await CapacityLookup.create({ percentage, days, hours })
      res.status(201).json(row)
    } catch (err) {
      if (isDuplicateKeyError(err)) {
        return res.status(409).json({ error: 'A row already exists for this percentage and days' })
      }
      next(err)
    }
  },
)

// GET /api/capacity-lookup -> list every row.
capacityLookupRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const rows = await CapacityLookup.find().sort({ percentage: 1, days: 1 })
    res.json(rows)
  } catch (err) {
    next(err)
  }
})

// PATCH /api/capacity-lookup/:id -> edit any subset of percentage/days/hours.
capacityLookupRouter.patch(
  '/:id',
  async (req: Request<{ id: string }, unknown, CapacityLookupBody>, res: Response, next: NextFunction) => {
    try {
      const { percentage, days, hours } = req.body
      const update: CapacityLookupBody = {}
      if (percentage !== undefined) update.percentage = percentage
      if (days !== undefined) update.days = days
      if (hours !== undefined) update.hours = hours

      const row = await CapacityLookup.findByIdAndUpdate(req.params.id, update, { new: true })

      if (!row) {
        return res.status(404).json({ error: 'Capacity lookup row not found' })
      }

      res.json(row)
    } catch (err) {
      if (isDuplicateKeyError(err)) {
        return res.status(409).json({ error: 'A row already exists for this percentage and days' })
      }
      next(err)
    }
  },
)

// DELETE /api/capacity-lookup/:id -> remove a row.
capacityLookupRouter.delete('/:id', async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
  try {
    const row = await CapacityLookup.findByIdAndDelete(req.params.id)

    if (!row) {
      return res.status(404).json({ error: 'Capacity lookup row not found' })
    }

    res.status(204).end()
  } catch (err) {
    next(err)
  }
})
