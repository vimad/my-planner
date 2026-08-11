import { Router, type NextFunction, type Request, type Response } from 'express'
import { getSprints, importSprint, searchJiraSprints } from '../services/sprintSync.ts'
import { Team } from '../models/Team.ts'

export const sprintsRouter = Router()

interface ImportSprintBody {
  teamId?: string
  jiraSprintId?: number | string
}

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

// GET /api/sprints/search?teamId=&q= -> live Jira search (bypasses the
// cache/TTL entirely) so a sprint that exists in Jira but hasn't been
// synced yet (e.g. a future sprint) can be found right away. `q` blank or
// omitted returns the board's full sprint list.
sprintsRouter.get('/search', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { teamId, q } = req.query

    if (!teamId || typeof teamId !== 'string') {
      return res.status(400).json({ error: 'teamId is required' })
    }

    const team = await Team.findById(teamId)
    if (!team) {
      return res.status(404).json({ error: 'Team not found' })
    }

    const sprints = await searchJiraSprints(typeof q === 'string' ? q : '')
    if (sprints === null) {
      return res.status(502).json({ error: 'Could not resolve the Jira board' })
    }

    res.json(sprints)
  } catch (err) {
    next(err)
  }
})

// POST /api/sprints -> body { teamId, jiraSprintId }. Imports one sprint
// fresh from Jira by its numeric id and upserts it into the cache
// (idempotent — see services/sprintSync.ts's importSprint).
sprintsRouter.post(
  '/',
  async (req: Request<Record<string, never>, unknown, ImportSprintBody>, res: Response, next: NextFunction) => {
    try {
      const { teamId, jiraSprintId } = req.body

      if (!teamId || jiraSprintId === undefined || jiraSprintId === null || jiraSprintId === '') {
        return res.status(400).json({ error: 'teamId and jiraSprintId are required' })
      }

      const numericId = Number(jiraSprintId)
      if (!Number.isFinite(numericId)) {
        return res.status(400).json({ error: 'jiraSprintId must be a number' })
      }

      const team = await Team.findById(teamId)
      if (!team) {
        return res.status(404).json({ error: 'Team not found' })
      }

      let sprint
      try {
        sprint = await importSprint(numericId)
      } catch {
        return res.status(502).json({ error: `Jira did not return a sprint for id ${numericId}` })
      }

      res.json(sprint)
    } catch (err) {
      next(err)
    }
  },
)
