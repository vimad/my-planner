import { Router, type NextFunction, type Request, type Response } from 'express'
import { TeamSprintPlan } from '../models/TeamSprintPlan.ts'
import { computeWorkingDays } from '../services/sprintWorkingDays.ts'
import { isDuplicateKeyError } from '../utils/mongoErrors.ts'

export const teamSprintPlansRouter = Router()

// Request body shape for create/update — client-supplied and unvalidated, so
// fields are optional here even though the model requires them; the
// handlers below enforce presence before writing. `workingDays` is
// deliberately absent — it's server-derived from startDate/endDate/holidays
// via computeWorkingDays, never accepted from the client (spec's route
// contract decision).
interface TeamSprintPlanBody {
  teamId?: string
  sprintId?: string
  startDate?: string
  endDate?: string
  holidays?: string[]
}

// Shared POST/PATCH validation: startDate/endDate both required, endDate
// must not precede startDate. Returns an error message, or null when valid.
function validatePeriod(startDate: unknown, endDate: unknown): string | null {
  if (typeof startDate !== 'string' || !startDate || typeof endDate !== 'string' || !endDate) {
    return 'startDate and endDate are required'
  }
  if (endDate < startDate) {
    return 'endDate must not be before startDate'
  }
  return null
}

// POST /api/team-sprint-plans -> create the Team x Sprint header. Rejects a
// duplicate (teamId, sprintId) pair with 409 — enforced by the model's
// unique compound index.
teamSprintPlansRouter.post(
  '/',
  async (req: Request<Record<string, never>, unknown, TeamSprintPlanBody>, res: Response, next: NextFunction) => {
    try {
      const { teamId, sprintId, startDate, endDate, holidays } = req.body

      if (!teamId || !sprintId) {
        return res.status(400).json({ error: 'teamId, sprintId, startDate and endDate are required' })
      }
      const periodError = validatePeriod(startDate, endDate)
      if (periodError) {
        return res.status(400).json({ error: periodError })
      }

      const holidayList = holidays ?? []
      const workingDays = computeWorkingDays(startDate as string, endDate as string, holidayList)
      const plan = await TeamSprintPlan.create({
        teamId,
        sprintId,
        startDate,
        endDate,
        holidays: holidayList,
        workingDays,
      })
      res.status(201).json(plan)
    } catch (err) {
      if (isDuplicateKeyError(err)) {
        return res.status(409).json({ error: 'A plan already exists for this team and sprint' })
      }
      next(err)
    }
  },
)

// GET /api/team-sprint-plans?teamId=&sprintId= -> the single plan doc for
// that pair, or 404 if a period hasn't been set yet.
teamSprintPlansRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { teamId, sprintId } = req.query

    if (!teamId || typeof teamId !== 'string' || !sprintId || typeof sprintId !== 'string') {
      return res.status(400).json({ error: 'teamId and sprintId are required' })
    }

    const plan = await TeamSprintPlan.findOne({ teamId, sprintId })
    if (!plan) {
      return res.status(404).json({ error: 'Team sprint plan not found' })
    }

    res.json(plan)
  } catch (err) {
    next(err)
  }
})

// PATCH /api/team-sprint-plans/:id -> edit the period (startDate/endDate/
// holidays), recomputing and overwriting workingDays.
teamSprintPlansRouter.patch(
  '/:id',
  async (req: Request<{ id: string }, unknown, TeamSprintPlanBody>, res: Response, next: NextFunction) => {
    try {
      const { startDate, endDate, holidays } = req.body

      const periodError = validatePeriod(startDate, endDate)
      if (periodError) {
        return res.status(400).json({ error: periodError })
      }

      const holidayList = holidays ?? []
      const workingDays = computeWorkingDays(startDate as string, endDate as string, holidayList)
      const plan = await TeamSprintPlan.findByIdAndUpdate(
        req.params.id,
        { startDate, endDate, holidays: holidayList, workingDays },
        { returnDocument: 'after' },
      )

      if (!plan) {
        return res.status(404).json({ error: 'Team sprint plan not found' })
      }

      res.json(plan)
    } catch (err) {
      next(err)
    }
  },
)
