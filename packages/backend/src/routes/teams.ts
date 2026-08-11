import { Router, type NextFunction, type Request, type Response } from 'express'
import { Team, type TeamDoc } from '../models/Team.ts'

export const teamsRouter = Router()

// Request body shape for create/update — client-supplied and unvalidated, so
// both fields are optional here even though the model requires them; the
// handlers below enforce presence before writing.
interface TeamBody {
  name?: string
  jiraLabels?: string[]
}

// POST /api/teams -> create a team. Independent of Profile — no profileId
// scoping anywhere in this router (see CONTEXT.md's Team definition).
teamsRouter.post('/', async (req: Request<Record<string, never>, unknown, TeamBody>, res: Response, next: NextFunction) => {
  try {
    const { name, jiraLabels } = req.body

    if (!name || !jiraLabels || jiraLabels.length === 0) {
      return res.status(400).json({ error: 'name and jiraLabels are required' })
    }

    const team = await Team.create({ name, jiraLabels })
    res.status(201).json(team)
  } catch (err) {
    next(err)
  }
})

// GET /api/teams -> list all teams, creation order.
teamsRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const teams = await Team.find().sort({ createdAt: 1 })
    res.json(teams)
  } catch (err) {
    next(err)
  }
})

// PATCH /api/teams/:id -> rename and/or edit jiraLabels. No cache
// invalidation needed elsewhere — team membership of a ticket is always
// computed live from Ticket.labels, never persisted (see spec).
teamsRouter.patch(
  '/:id',
  async (req: Request<{ id: string }, unknown, TeamBody>, res: Response, next: NextFunction) => {
    try {
      const { name, jiraLabels } = req.body
      const update: Partial<TeamDoc> = {}
      if (name !== undefined) update.name = name
      if (jiraLabels !== undefined) update.jiraLabels = jiraLabels

      const team = await Team.findByIdAndUpdate(req.params.id, update, { returnDocument: 'after' })

      if (!team) {
        return res.status(404).json({ error: 'Team not found' })
      }

      res.json(team)
    } catch (err) {
      next(err)
    }
  },
)

// DELETE /api/teams/:id -> delete a team only. TeamMembership rows referencing
// it are left dangling by design (same no-cascade posture as Board.items) —
// cascade cleanup, if wanted, is later-ticket work once the rest of the
// Sprint domain model exists.
teamsRouter.delete('/:id', async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
  try {
    const team = await Team.findByIdAndDelete(req.params.id)

    if (!team) {
      return res.status(404).json({ error: 'Team not found' })
    }

    res.status(204).end()
  } catch (err) {
    next(err)
  }
})
