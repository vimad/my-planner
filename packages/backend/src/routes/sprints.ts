import { Router, type NextFunction, type Request, type Response } from 'express'
import { listSprints, resolveBoard } from '../services/jiraClient.ts'
import { Sprint } from '../models/Sprint.ts'
import { Team } from '../models/Team.ts'

export const sprintsRouter = Router()

// Phase 1 targets one Jira project/board for every team — team.jiraLabels
// only filter tickets *within* it (see spec's "Jira instance"). Matches
// scripts/verifyJira.ts and the recorded board id (235) in README.md.
const PROJECT_KEY = 'WOSMVP'
const BOARD_NAME = 'Odyssey'

// GET /api/sprints?teamId=... -> resolves the team's board and lists/caches
// its sprints. teamId only serves to validate the caller has a real team in
// hand; the board itself is shared across all teams in phase 1.
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

    const board = await resolveBoard(PROJECT_KEY, BOARD_NAME)
    if (!board) {
      return res.status(502).json({ error: 'Could not resolve the Jira board' })
    }

    const jiraSprints = await listSprints(board.id, ['active', 'future', 'closed'])
    const syncedAt = new Date()

    const sprints = await Promise.all(
      jiraSprints.map((sprint) =>
        Sprint.findOneAndUpdate(
          { jiraSprintId: String(sprint.id) },
          {
            jiraSprintId: String(sprint.id),
            name: sprint.name,
            state: sprint.state,
            startDate: sprint.startDate ? new Date(sprint.startDate) : null,
            endDate: sprint.endDate ? new Date(sprint.endDate) : null,
            lastSyncedAt: syncedAt,
          },
          { upsert: true, returnDocument: 'after' },
        ),
      ),
    )

    res.json(sprints)
  } catch (err) {
    next(err)
  }
})
