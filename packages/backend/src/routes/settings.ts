import { Router, type NextFunction, type Request, type Response } from 'express'
import { Settings, type SettingsDoc } from '../models/Settings.ts'

export const settingsRouter = Router()

interface UpdateSettingsBody {
  nextOfficeDay?: string | null
}

// GET /api/settings -> the single settings document, upserting an empty
// one on first access rather than requiring a seed step.
settingsRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const settings = await Settings.findOneAndUpdate(
      {},
      {},
      { upsert: true, new: true, setDefaultsOnInsert: true },
    )
    res.json(settings)
  } catch (err) {
    next(err)
  }
})

// PATCH /api/settings -> update nextOfficeDay. Pass null to clear it (e.g.
// after the office day has passed and nothing new is scheduled yet).
settingsRouter.patch(
  '/',
  async (
    req: Request<Record<string, never>, unknown, UpdateSettingsBody>,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const { nextOfficeDay } = req.body
      const update: Partial<SettingsDoc> = {}
      if (nextOfficeDay !== undefined) update.nextOfficeDay = nextOfficeDay

      const settings = await Settings.findOneAndUpdate({}, update, {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true,
      })
      res.json(settings)
    } catch (err) {
      next(err)
    }
  },
)
