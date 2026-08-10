import { Router, type NextFunction, type Request, type Response } from 'express'
import { Status } from '../models/Status.ts'

export const statusesRouter = Router()

// GET /api/statuses -> the current locally-mirrored workflow-status set,
// ordered to match the real Jira board's columns. Refreshed wholesale as a
// side effect of every sync action (see services/statusSync.ts) — never
// hand-edited here.
statusesRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const statuses = await Status.find().sort({ order: 1 })
    res.json(statuses)
  } catch (err) {
    next(err)
  }
})
