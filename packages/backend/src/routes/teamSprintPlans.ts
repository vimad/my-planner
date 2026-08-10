import { Router, type NextFunction, type Request, type Response } from 'express'
import { TeamSprintPlan } from '../models/TeamSprintPlan.ts'
import { isDuplicateKeyError } from '../utils/mongoErrors.ts'

export const teamSprintPlansRouter = Router()

// Request body shape for create/update — client-supplied and unvalidated, so
// fields are optional here even though the model requires them; the
// handlers below enforce presence before writing.
interface TeamSprintPlanBody {
  teamId?: string
  sprintId?: string
  workingDays?: number
}

// POST /api/team-sprint-plans -> create the Team x Sprint header. Rejects a
// duplicate (teamId, sprintId) pair with 409 — enforced by the model's
// unique compound index.
teamSprintPlansRouter.post(
  '/',
  async (req: Request<Record<string, never>, unknown, TeamSprintPlanBody>, res: Response, next: NextFunction) => {
    try {
      const { teamId, sprintId, workingDays } = req.body

      if (!teamId || !sprintId || typeof workingDays !== 'number') {
        return res.status(400).json({ error: 'teamId, sprintId and workingDays are required' })
      }

      const plan = await TeamSprintPlan.create({ teamId, sprintId, workingDays })
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
// that pair, or 404 if working days haven't been entered yet.
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

// PATCH /api/team-sprint-plans/:id -> edit workingDays.
teamSprintPlansRouter.patch(
  '/:id',
  async (req: Request<{ id: string }, unknown, TeamSprintPlanBody>, res: Response, next: NextFunction) => {
    try {
      const { workingDays } = req.body

      if (typeof workingDays !== 'number') {
        return res.status(400).json({ error: 'workingDays must be a number' })
      }

      const plan = await TeamSprintPlan.findByIdAndUpdate(req.params.id, { workingDays }, { new: true })

      if (!plan) {
        return res.status(404).json({ error: 'Team sprint plan not found' })
      }

      res.json(plan)
    } catch (err) {
      next(err)
    }
  },
)
