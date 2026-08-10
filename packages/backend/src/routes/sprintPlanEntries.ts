import { Router, type NextFunction, type Request, type Response } from 'express'
import { SprintPlanEntry } from '../models/SprintPlanEntry.ts'
import type { TicketDoc } from '../models/Ticket.ts'
import { refreshStatusSet } from '../services/statusSync.ts'
import { fullSyncTickets, type SyncedTicket } from '../services/ticketSync.ts'
import { isDuplicateKeyError } from '../utils/mongoErrors.ts'

export const sprintPlanEntriesRouter = Router()

interface AddToPlanBody {
  teamId?: string
  sprintId?: string
  jiraKey?: string
}

interface SyncPlanBody {
  teamId?: string
  sprintId?: string
}

interface ReorderBody {
  order?: number
}

// Order at the end of `assigneeAccountId`'s current row within this
// team+sprint's plan — ticket 10's per-assignee (not global) order. When
// `excludeTicketId` is given (the reassignment-reset path), that ticket's
// own existing entry is left out of the max so it doesn't anchor against
// its own stale position.
async function nextOrderForAssignee(
  teamId: string,
  sprintId: string,
  assigneeAccountId: string | null,
  excludeTicketId?: string,
): Promise<number> {
  const entries = await SprintPlanEntry.find({ teamId, sprintId }).populate<{ ticketId: TicketDoc & { _id: string } }>(
    'ticketId',
  )

  let max = -1
  for (const entry of entries) {
    const ticket = entry.ticketId
    if (excludeTicketId && String(ticket._id) === String(excludeTicketId)) continue
    if (ticket.assigneeAccountId === assigneeAccountId) {
      max = Math.max(max, entry.order)
    }
  }
  return max + 1
}

// Reassignment handling (spec): whenever a Full sync updates a ticket's
// assignee, any SprintPlanEntry referencing it in this team+sprint gets its
// order reset to the end of the new assignee's row. Newly-created tickets
// (no prior doc) are skipped — they have no existing entry to reset yet.
async function applyReassignmentResets(teamId: string, sprintId: string, synced: SyncedTicket[]): Promise<void> {
  for (const { ticket, previousAssigneeAccountId, isNew } of synced) {
    if (isNew || previousAssigneeAccountId === ticket.assigneeAccountId) continue

    const entry = await SprintPlanEntry.findOne({ teamId, sprintId, ticketId: ticket._id })
    if (!entry) continue

    entry.order = await nextOrderForAssignee(teamId, sprintId, ticket.assigneeAccountId, String(ticket._id))
    await entry.save()
  }
}

// POST /api/sprint-plan-entries -> body { teamId, sprintId, jiraKey }. Full
// syncs that ticket (+ its sub-tasks) then adds it to the plan at the end of
// its current assignee's row.
sprintPlanEntriesRouter.post(
  '/',
  async (req: Request<Record<string, never>, unknown, AddToPlanBody>, res: Response, next: NextFunction) => {
    try {
      const { teamId, sprintId, jiraKey } = req.body

      if (!teamId || !sprintId || !jiraKey) {
        return res.status(400).json({ error: 'teamId, sprintId and jiraKey are required' })
      }

      const synced = await fullSyncTickets([jiraKey])
      const primary = synced.find((s) => s.ticket.jiraKey === jiraKey)
      if (!primary) {
        return res.status(502).json({ error: `Jira did not return an issue for ${jiraKey}` })
      }

      await applyReassignmentResets(teamId, sprintId, synced)
      await refreshStatusSet()

      const order = await nextOrderForAssignee(teamId, sprintId, primary.ticket.assigneeAccountId)
      const entry = await SprintPlanEntry.create({ teamId, sprintId, ticketId: primary.ticket._id, order })
      const populated = await entry.populate('ticketId')

      res.status(201).json(populated)
    } catch (err) {
      if (isDuplicateKeyError(err)) {
        return res.status(409).json({ error: 'This ticket is already in the plan for this team and sprint' })
      }
      next(err)
    }
  },
)

// GET /api/sprint-plan-entries?teamId=&sprintId= -> lists the plan with
// Ticket populated. Grouping by assignee is left to the client.
sprintPlanEntriesRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { teamId, sprintId } = req.query

    if (!teamId || typeof teamId !== 'string' || !sprintId || typeof sprintId !== 'string') {
      return res.status(400).json({ error: 'teamId and sprintId are required' })
    }

    const entries = await SprintPlanEntry.find({ teamId, sprintId }).populate('ticketId').sort({ order: 1 })
    res.json(entries)
  } catch (err) {
    next(err)
  }
})

// POST /api/sprint-plan-entries/sync -> body { teamId, sprintId }. Full
// syncs every ticket already in the plan plus their sub-tasks (batched via
// fullSyncTickets/bulkFetchIssues, <=100 keys/call).
sprintPlanEntriesRouter.post(
  '/sync',
  async (req: Request<Record<string, never>, unknown, SyncPlanBody>, res: Response, next: NextFunction) => {
    try {
      const { teamId, sprintId } = req.body

      if (!teamId || !sprintId) {
        return res.status(400).json({ error: 'teamId and sprintId are required' })
      }

      const entries = await SprintPlanEntry.find({ teamId, sprintId }).populate<{ ticketId: TicketDoc }>('ticketId')
      const jiraKeys = entries.map((entry) => entry.ticketId.jiraKey)

      const synced = await fullSyncTickets(jiraKeys)
      await applyReassignmentResets(teamId, sprintId, synced)
      await refreshStatusSet()

      const refreshed = await SprintPlanEntry.find({ teamId, sprintId }).populate('ticketId').sort({ order: 1 })
      res.json(refreshed)
    } catch (err) {
      next(err)
    }
  },
)

// PATCH /api/sprint-plan-entries/:id -> body { order }. Drag-reorder
// save-on-drop (ticket 19 is the UI consumer).
sprintPlanEntriesRouter.patch(
  '/:id',
  async (req: Request<{ id: string }, unknown, ReorderBody>, res: Response, next: NextFunction) => {
    try {
      const { order } = req.body

      if (typeof order !== 'number') {
        return res.status(400).json({ error: 'order must be a number' })
      }

      const entry = await SprintPlanEntry.findByIdAndUpdate(req.params.id, { order }, { new: true }).populate(
        'ticketId',
      )

      if (!entry) {
        return res.status(404).json({ error: 'Sprint plan entry not found' })
      }

      res.json(entry)
    } catch (err) {
      next(err)
    }
  },
)
