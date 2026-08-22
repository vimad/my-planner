import { Router, type NextFunction, type Request, type Response } from 'express'
import { AtlasPlanningHoliday } from '../models/AtlasPlanningHoliday.ts'
import { computeRollingWindowDates } from '../utils/rollingWindow.ts'
import { isDuplicateKeyError } from '../utils/mongoErrors.ts'

export const atlasPlanningHolidaysRouter = Router()

const DATE_SHAPE = /^\d{4}-\d{2}-\d{2}$/

interface CreateHolidayBody {
  date?: string
}

// POST /api/atlas-planning-holidays -> toggles a date "on" as a shared
// holiday for the whole roster (.scratch/atlas-planning-tab, ticket 02).
// Only ever called by the holiday chip row when that date is not currently
// marked - toggling "off" goes through DELETE. A double-toggle race
// surfaces as 409 via the model's real unique index on `date`, not a
// pre-check findOne.
atlasPlanningHolidaysRouter.post(
  '/',
  async (req: Request<Record<string, never>, unknown, CreateHolidayBody>, res: Response, next: NextFunction) => {
    try {
      const date = req.body.date?.trim()

      if (!date || !DATE_SHAPE.test(date)) {
        return res.status(400).json({ error: 'date is required and must be a YYYY-MM-DD string' })
      }

      const holiday = await AtlasPlanningHoliday.create({ date })
      res.status(201).json(holiday)
    } catch (err) {
      if (isDuplicateKeyError(err)) {
        return res.status(409).json({ error: 'That date is already marked as a holiday' })
      }
      next(err)
    }
  },
)

// GET /api/atlas-planning-holidays -> every holiday whose date currently
// falls within the rolling two-week window. Same read-time reconciliation
// as GET /api/atlas-planning-leave - an aged-out holiday simply isn't
// returned, never deleted.
atlasPlanningHolidaysRouter.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const windowDates = computeRollingWindowDates()
    const holidays = await AtlasPlanningHoliday.find({ date: { $in: windowDates } }).sort({ date: 1 })
    res.json(holidays)
  } catch (err) {
    next(err)
  }
})

// DELETE /api/atlas-planning-holidays/:id -> toggles a date back "off".
atlasPlanningHolidaysRouter.delete('/:id', async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
  try {
    const holiday = await AtlasPlanningHoliday.findByIdAndDelete(req.params.id)

    if (!holiday) {
      return res.status(404).json({ error: 'Holiday not found' })
    }

    res.status(204).end()
  } catch (err) {
    next(err)
  }
})
