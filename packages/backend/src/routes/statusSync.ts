import { Router, type NextFunction, type Request, type Response } from 'express'
import { Person } from '../models/Person.ts'
import { Sprint } from '../models/Sprint.ts'
import { Team } from '../models/Team.ts'
import { refreshStatusSet } from '../services/statusSync.ts'
import { lightweightSyncTickets } from '../services/ticketSync.ts'

export const statusSyncRouter = Router()

interface StatusSyncBody {
  teamId?: string
  personId?: string
  sprintId?: string
}

// POST /api/status-sync -> body { teamId, personId, sprintId }. The Status
// view's per-person sync icon (spec's "Lightweight sync"): discovers every
// ticket currently assigned to this person, in this sprint, within this
// team's Jira label filter, via a title+status-only search/jql call, then
// refreshes the mirrored Status set as a side effect (see
// services/statusSync.ts) — no dedicated status-refresh endpoint/button.
statusSyncRouter.post(
  '/',
  async (req: Request<Record<string, never>, unknown, StatusSyncBody>, res: Response, next: NextFunction) => {
    try {
      const { teamId, personId, sprintId } = req.body

      if (!teamId || !personId || !sprintId) {
        return res.status(400).json({ error: 'teamId, personId and sprintId are required' })
      }

      const [team, person, sprint] = await Promise.all([
        Team.findById(teamId),
        Person.findById(personId),
        Sprint.findById(sprintId),
      ])
      if (!team) return res.status(404).json({ error: 'Team not found' })
      if (!person) return res.status(404).json({ error: 'Person not found' })
      if (!sprint) return res.status(404).json({ error: 'Sprint not found' })

      const labelClause = team.jiraLabels.map((label) => `"${label}"`).join(', ')
      const jql = `assignee = "${person.jiraAccountId}" AND sprint = ${sprint.jiraSprintId} AND labels in (${labelClause})`

      const tickets = await lightweightSyncTickets(jql)
      await refreshStatusSet()

      res.json(tickets)
    } catch (err) {
      next(err)
    }
  },
)
