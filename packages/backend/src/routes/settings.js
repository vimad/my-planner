import { Router } from 'express'
import { Settings } from '../models/Settings.js'

export const settingsRouter = Router()

// GET /api/settings -> the single settings document, upserting an empty
// one on first access rather than requiring a seed step.
settingsRouter.get('/', async (req, res, next) => {
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
settingsRouter.patch('/', async (req, res, next) => {
  try {
    const { nextOfficeDay } = req.body
    const update = {}
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
})
