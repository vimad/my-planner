import { Router, type NextFunction, type Request, type Response } from 'express'
import { TicketDevQaOverride } from '../models/TicketDevQaOverride.ts'

export const ticketsRouter = Router()

interface DevQaOverrideBody {
  devPersonId?: string | null
  qaPersonId?: string | null
}

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
        { upsert: true, new: true, setDefaultsOnInsert: true },
      )

      res.json(override)
    } catch (err) {
      next(err)
    }
  },
)
