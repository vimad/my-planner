import { Router, type NextFunction, type Request, type Response } from 'express'
import { Epic } from '../models/Epic.ts'
import { Sprint } from '../models/Sprint.ts'
import { Ticket } from '../models/Ticket.ts'

export const epicsRouter = Router()

// GET /api/epics?sprintId=... -> epics with at least one child Ticket
// currently in that sprint (per Ticket.currentSprintKey, Jira's live
// answer), each with a child-ticket rollup computed from Ticket.epicKey —
// never stored on the Epic doc itself (see CONTEXT.md "Epic").
//
// "Done" rollup counting is a phase-1 approximation against the raw status
// name until the Status model (workflow category mapping) exists — see
// spec's Status.ts.
epicsRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { sprintId } = req.query

    if (!sprintId || typeof sprintId !== 'string') {
      return res.status(400).json({ error: 'sprintId is required' })
    }

    const sprint = await Sprint.findById(sprintId)
    if (!sprint) {
      return res.status(404).json({ error: 'Sprint not found' })
    }

    const epicKeys = await Ticket.distinct('epicKey', {
      currentSprintKey: sprint.jiraSprintId,
      epicKey: { $ne: null },
    })
    const epics = await Epic.find({ jiraKey: { $in: epicKeys } })

    const withRollup = await Promise.all(
      epics.map(async (epic) => {
        const childTickets = await Ticket.find({ epicKey: epic.jiraKey })
        const childCount = childTickets.length
        const doneCount = childTickets.filter((ticket) => ticket.status === 'Done').length
        return { ...epic.toObject(), childCount, doneCount }
      }),
    )

    res.json(withRollup)
  } catch (err) {
    next(err)
  }
})
