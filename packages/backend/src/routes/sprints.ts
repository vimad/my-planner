import { Router, type NextFunction, type Request, type Response } from 'express'
import { getSprints } from '../services/sprintSync.ts'
import { Team } from '../models/Team.ts'

export const sprintsRouter = Router()

// GET /api/sprints?teamId=... -> cache-first list of the team's board's
// sprints (see services/sprintSync.ts's staleness comment for why this
// isn't a live Jira call on every request). teamId only serves to validate
// the caller has a real team in hand; the board itself is shared across all
// teams in phase 1.
sprintsRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { teamId } = req.query

    if (!teamId || typeof teamId !== 'string') {
      return res.status(400).json({ error: 'teamId is required' })
    }

    const team = await Team.findById(teamId)
    if (!team) {
      return res.status(404).json({ error: 'Team not found' })
    }

    const sprints = await getSprints()
    if (sprints === null) {
      return res.status(502).json({ error: 'Could not resolve the Jira board' })
    }

    res.json(sprints)
  } catch (err) {
    next(err)
  }
})
