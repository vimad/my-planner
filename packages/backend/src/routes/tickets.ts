import { Router, type NextFunction, type Request, type Response } from 'express'
import { Sprint } from '../models/Sprint.ts'
import { Team } from '../models/Team.ts'
import { Ticket } from '../models/Ticket.ts'
import { TicketAssigneeOverride } from '../models/TicketAssigneeOverride.ts'
import { TicketDevQaOverride } from '../models/TicketDevQaOverride.ts'
import { TicketFeatureOverride } from '../models/TicketFeatureOverride.ts'

export const ticketsRouter = Router()

interface DevQaOverrideBody {
  devPersonId?: string | null
  qaPersonId?: string | null
}

interface AssigneeOverrideBody {
  personId?: string | null
}

interface FeatureOverrideBody {
  isFeature?: unknown
}

// GET /api/tickets?teamId=&sprintId= -> every cached Ticket currently in
// that sprint (Ticket.currentSprintKey, Jira's live answer) and within the
// team's Jira label filter — the same scope Lightweight sync's JQL applies
// per-person (routes/statusSync.ts), minus the assignee clause, so the
// Status view can read cached data for the whole roster (per-row ticket
// count/last-synced) without syncing anyone first, and re-read it after a
// per-person sync without a second bespoke endpoint.
ticketsRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { teamId, sprintId } = req.query

    if (!teamId || typeof teamId !== 'string' || !sprintId || typeof sprintId !== 'string') {
      return res.status(400).json({ error: 'teamId and sprintId are required' })
    }

    const [team, sprint] = await Promise.all([Team.findById(teamId), Sprint.findById(sprintId)])
    if (!team) return res.status(404).json({ error: 'Team not found' })
    if (!sprint) return res.status(404).json({ error: 'Sprint not found' })

    const tickets = await Ticket.find({ currentSprintKey: sprint.jiraSprintId, labels: { $in: team.jiraLabels } })
    res.json(tickets)
  } catch (err) {
    next(err)
  }
})

// PUT /api/tickets/:ticketId/dev-qa-override -> body
// { devPersonId?, qaPersonId? }. Upserts the ticket's TicketDevQaOverride,
// touching only whichever role(s) are present in the body — distinguished
// by presence, not truthiness, same convention as team-memberships.ts's
// capacityPercentOverride PATCH (an explicit `null` clears that role's
// Override back to normal resolution; an omitted field leaves it as-is).
// Used both to fill in a needs-assignment role for the first time and to
// later edit an already-set Override (ticket 24's popup). Once set for a
// role, the Override always wins over Jira resync for that role — see ADR
// 0004 — which devQaResolution.ts's resolveDevQa enforces by checking here
// before ever looking at a real Sub-task assignee.
ticketsRouter.put(
  '/:ticketId/dev-qa-override',
  async (req: Request<{ ticketId: string }, unknown, DevQaOverrideBody>, res: Response, next: NextFunction) => {
    try {
      // Left as raw client-supplied strings (not cast to Types.ObjectId) —
      // Mongoose casts them itself when applying $set, same as every other
      // route in this repo that passes a body string straight into an
      // ObjectId ref field (e.g. sprintPlanEntries.ts's SprintPlanEntry.create).
      const update: { devPersonId?: string | null; qaPersonId?: string | null } = {}
      if ('devPersonId' in req.body) update.devPersonId = req.body.devPersonId ?? null
      if ('qaPersonId' in req.body) update.qaPersonId = req.body.qaPersonId ?? null

      const override = await TicketDevQaOverride.findOneAndUpdate(
        { ticketId: req.params.ticketId },
        { $set: update, $setOnInsert: { ticketId: req.params.ticketId } },
        { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
      )

      res.json(override)
    } catch (err) {
      next(err)
    }
  },
)

// PUT /api/tickets/:ticketId/assignee-override -> body { personId }. Upserts
// the (non-split) ticket's TicketAssigneeOverride - a Planning-only owner
// that never touches Jira, mirroring the dev-qa-override route above but for
// a single slot instead of a dev/qa pair (docs/adr/0005). `personId` is
// required (unlike dev-qa-override's two optional roles, there's only one
// field here): an explicit `null` clears the Override back to following
// Jira's own assignee.
ticketsRouter.put(
  '/:ticketId/assignee-override',
  async (req: Request<{ ticketId: string }, unknown, AssigneeOverrideBody>, res: Response, next: NextFunction) => {
    try {
      if (!('personId' in req.body)) {
        return res.status(400).json({ error: 'personId is required' })
      }

      const override = await TicketAssigneeOverride.findOneAndUpdate(
        { ticketId: req.params.ticketId },
        { $set: { personId: req.body.personId ?? null }, $setOnInsert: { ticketId: req.params.ticketId } },
        { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
      )

      res.json(override)
    } catch (err) {
      next(err)
    }
  },
)

// PATCH /api/tickets/:ticketId/feature -> body { isFeature }. Upserts the
// (non-split) ticket's TicketFeatureOverride - the Sprint Breakdown card's
// Feature-vs-Technical-item classification (map's Notes), mirroring the
// assignee-override route above but with no "clear" state: `isFeature` is
// always a plain boolean (true or false), never null, so there's no
// "follow Jira" default to fall back to the way personId has one.
ticketsRouter.patch(
  '/:ticketId/feature',
  async (req: Request<{ ticketId: string }, unknown, FeatureOverrideBody>, res: Response, next: NextFunction) => {
    try {
      if (!('isFeature' in req.body) || typeof req.body.isFeature !== 'boolean') {
        return res.status(400).json({ error: 'isFeature is required and must be a boolean' })
      }

      const override = await TicketFeatureOverride.findOneAndUpdate(
        { ticketId: req.params.ticketId },
        { $set: { isFeature: req.body.isFeature }, $setOnInsert: { ticketId: req.params.ticketId } },
        { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
      )

      res.json(override)
    } catch (err) {
      next(err)
    }
  },
)
