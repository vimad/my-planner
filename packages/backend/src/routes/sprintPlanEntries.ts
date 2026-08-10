import { Router, type NextFunction, type Request, type Response } from 'express'
import type { Types } from 'mongoose'
import { SprintPlanEntry } from '../models/SprintPlanEntry.ts'
import { Ticket, type TicketDoc } from '../models/Ticket.ts'
import { TeamMembership } from '../models/TeamMembership.ts'
import { TicketDevQaOverride } from '../models/TicketDevQaOverride.ts'
import type { PersonDoc } from '../models/Person.ts'
import { refreshStatusSet } from '../services/statusSync.ts'
import { fullSyncTickets, type SyncedTicket } from '../services/ticketSync.ts'
import {
  isSplitTicket,
  resolveDevQa,
  type DevQaResolution,
  type MembershipForResolution,
} from '../services/devQaResolution.ts'
import { isDuplicateKeyError } from '../utils/mongoErrors.ts'

export const sprintPlanEntriesRouter = Router()

type PopulatedTicket = TicketDoc & { _id: Types.ObjectId }
type PopulatedPerson = PersonDoc & { _id: Types.ObjectId }

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
  devOrder?: number
  qaOrder?: number
}

// A team's current TeamMembership roster, reduced to what
// devQaResolution.ts's role resolution needs (ADR 0001's match key).
async function loadMembershipsForResolution(teamId: string): Promise<MembershipForResolution[]> {
  const memberships = await TeamMembership.find({ teamId }).populate<{ personId: PopulatedPerson }>('personId')
  return memberships.map((membership) => ({
    personId: membership.personId._id,
    jiraAccountId: membership.personId.jiraAccountId,
  }))
}

// Order at the end of `assigneeAccountId`'s current row within this
// team+sprint's plan — ticket 10's per-assignee (not global) order. When
// `excludeTicketId` is given (the reassignment-reset path), that ticket's
// own existing entry is left out of the max so it doesn't anchor against
// its own stale position. Non-split tickets only — see nextOrderForRole for
// a Split ticket's per-role equivalent.
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

// devOrder/qaOrder's equivalent of nextOrderForAssignee above: the order at
// the end of whichever Split entries' dev (or qa) Role assignment
// (devQaResolution.ts) currently resolves to the same person — meaningful
// only among other Split entries sharing that resolved person for that
// role, not a global order. `excludeTicketId` again leaves the ticket
// currently being placed/reset out of the max so it doesn't anchor against
// its own stale position.
async function nextOrderForRole(
  teamId: string,
  sprintId: string,
  role: 'dev' | 'qa',
  personId: Types.ObjectId,
  memberships: MembershipForResolution[],
  excludeTicketId?: string,
): Promise<number> {
  const entries = await SprintPlanEntry.find({ teamId, sprintId }).populate<{ ticketId: PopulatedTicket }>('ticketId')

  let max = -1
  for (const entry of entries) {
    const ticket = entry.ticketId
    if (excludeTicketId && String(ticket._id) === String(excludeTicketId)) continue
    if (!isSplitTicket(ticket.type)) continue

    const resolution = await resolveDevQa(ticket, memberships)
    const roleResolution = role === 'dev' ? resolution.dev : resolution.qa
    if (roleResolution.status !== 'resolved' || String(roleResolution.personId) !== String(personId)) continue

    const order = role === 'dev' ? entry.devOrder : entry.qaOrder
    if (order !== null && order !== undefined) max = Math.max(max, order)
  }
  return max + 1
}

// A synced [Dev]/[Test] Sub-task whose own assigneeAccountId changed can
// mean its parent Split ticket's dev/qa Role assignment resolved to someone
// new since the last sync — reset that role's own devOrder/qaOrder to the
// end of the newly-resolved person's row, mirroring the plain-`order` reset
// below, except a role currently pinned by a TicketDevQaOverride never
// moves this way (ADR 0004: an Override always wins over Jira resync).
// Deliberately not gated on `isNew` like the loop below: a brand-new
// Sub-task discovered on a ticket that was already in the plan (its dev/qa
// previously needs-assignment) is exactly the case this needs to catch, not
// only a reassignment of a pre-existing Sub-task.
async function applyDevQaRoleResets(teamId: string, sprintId: string, synced: SyncedTicket[]): Promise<void> {
  const roleChanges = synced.filter(
    ({ ticket, previousAssigneeAccountId }) =>
      (ticket.subtaskKind === 'Dev' || ticket.subtaskKind === 'Test') &&
      ticket.parentKey &&
      previousAssigneeAccountId !== ticket.assigneeAccountId,
  )
  if (roleChanges.length === 0) return

  const memberships = await loadMembershipsForResolution(teamId)

  for (const { ticket: subtask } of roleChanges) {
    const parentTicket = await Ticket.findOne({ jiraKey: subtask.parentKey })
    if (!parentTicket || !isSplitTicket(parentTicket.type)) continue

    const entry = await SprintPlanEntry.findOne({ teamId, sprintId, ticketId: parentTicket._id })
    if (!entry) continue

    const role = subtask.subtaskKind === 'Dev' ? 'dev' : 'qa'
    const override = await TicketDevQaOverride.findOne({ ticketId: parentTicket._id })
    const overriddenPersonId = role === 'dev' ? override?.devPersonId : override?.qaPersonId
    if (overriddenPersonId) continue // pinned — a resync never moves an Override-pinned role (ADR 0004)

    const resolution = await resolveDevQa(parentTicket, memberships)
    const roleResolution = role === 'dev' ? resolution.dev : resolution.qa
    if (roleResolution.status !== 'resolved') continue // unmapped/needs-assignment — no row to place it at the end of

    const newOrder = await nextOrderForRole(
      teamId,
      sprintId,
      role,
      roleResolution.personId,
      memberships,
      String(parentTicket._id),
    )
    if (role === 'dev') entry.devOrder = newOrder
    else entry.qaOrder = newOrder
    await entry.save()
  }
}

// Reassignment handling (spec): whenever a Full sync updates a ticket's
// assignee, any SprintPlanEntry referencing it in this team+sprint gets its
// order reset to the end of the new assignee's row. Newly-created tickets
// (no prior doc) are skipped — they have no existing entry to reset yet.
// A Split ticket (Story/Bug) never has its plain `order` touched this way
// (SprintPlanEntry.ts: a Split ticket ignores `order` entirely) — its
// devOrder/qaOrder reset via applyDevQaRoleResets instead, keyed off its
// Sub-tasks' own assignee changes rather than the parent's.
async function applyReassignmentResets(teamId: string, sprintId: string, synced: SyncedTicket[]): Promise<void> {
  for (const { ticket, previousAssigneeAccountId, isNew } of synced) {
    if (isNew || isSplitTicket(ticket.type) || previousAssigneeAccountId === ticket.assigneeAccountId) continue

    const entry = await SprintPlanEntry.findOne({ teamId, sprintId, ticketId: ticket._id })
    if (!entry) continue

    entry.order = await nextOrderForAssignee(teamId, sprintId, ticket.assigneeAccountId, String(ticket._id))
    await entry.save()
  }

  await applyDevQaRoleResets(teamId, sprintId, synced)
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

      // applyReassignmentResets above runs before this entry exists, so it
      // can never seed devOrder/qaOrder for a brand-new Split ticket — do
      // that here instead, the same way `order` is seeded above. A role
      // left needs-assignment or unmapped stays null (the schema default)
      // until it resolves on some later sync or Override.
      const createPayload: {
        teamId: string
        sprintId: string
        ticketId: Types.ObjectId
        order: number
        devOrder?: number
        qaOrder?: number
      } = { teamId, sprintId, ticketId: primary.ticket._id, order }

      if (isSplitTicket(primary.ticket.type)) {
        const memberships = await loadMembershipsForResolution(teamId)
        const resolution = await resolveDevQa(primary.ticket, memberships)
        if (resolution.dev.status === 'resolved') {
          createPayload.devOrder = await nextOrderForRole(teamId, sprintId, 'dev', resolution.dev.personId, memberships)
        }
        if (resolution.qa.status === 'resolved') {
          createPayload.qaOrder = await nextOrderForRole(teamId, sprintId, 'qa', resolution.qa.personId, memberships)
        }
      }

      const entry = await SprintPlanEntry.create(createPayload)
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
// Ticket populated. Grouping by assignee is left to the client. Each Split
// entry (Story/Bug) additionally carries `devQa: { dev, qa }` — its
// resolved dev/qa Role assignment (devQaResolution.ts), inlined so the
// frontend (ticket 24) doesn't redo the Sub-task/Override lookups itself.
// A non-split entry's shape is completely unchanged.
sprintPlanEntriesRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { teamId, sprintId } = req.query

    if (!teamId || typeof teamId !== 'string' || !sprintId || typeof sprintId !== 'string') {
      return res.status(400).json({ error: 'teamId and sprintId are required' })
    }

    const entries = await SprintPlanEntry.find({ teamId, sprintId }).populate<{ ticketId: PopulatedTicket }>(
      'ticketId',
    ).sort({ order: 1 })

    const hasSplitEntry = entries.some((entry) => isSplitTicket(entry.ticketId.type))
    const memberships = hasSplitEntry ? await loadMembershipsForResolution(teamId) : []

    const withDevQa = await Promise.all(
      entries.map(async (entry): Promise<unknown> => {
        const ticket = entry.ticketId
        if (!isSplitTicket(ticket.type)) return entry

        const devQa: DevQaResolution = await resolveDevQa(ticket, memberships)
        return { ...entry.toObject(), devQa }
      }),
    )

    res.json(withDevQa)
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

// PATCH /api/sprint-plan-entries/:id -> body { order?, devOrder?, qaOrder? },
// only-touch-what's-present (same convention as PUT
// /api/tickets/:ticketId/dev-qa-override). Drag-reorder save-on-drop (ticket
// 19 is the UI consumer): a non-split placement patches `order`; a Split
// ticket's dev-row or qa-row placement patches only that role's own
// devOrder/qaOrder, never both in the same request.
sprintPlanEntriesRouter.patch(
  '/:id',
  async (req: Request<{ id: string }, unknown, ReorderBody>, res: Response, next: NextFunction) => {
    try {
      const { order, devOrder, qaOrder } = req.body
      const update: Partial<Record<'order' | 'devOrder' | 'qaOrder', number>> = {}

      if (order !== undefined) {
        if (typeof order !== 'number') return res.status(400).json({ error: 'order must be a number' })
        update.order = order
      }
      if (devOrder !== undefined) {
        if (typeof devOrder !== 'number') return res.status(400).json({ error: 'devOrder must be a number' })
        update.devOrder = devOrder
      }
      if (qaOrder !== undefined) {
        if (typeof qaOrder !== 'number') return res.status(400).json({ error: 'qaOrder must be a number' })
        update.qaOrder = qaOrder
      }
      if (Object.keys(update).length === 0) {
        return res.status(400).json({ error: 'order, devOrder or qaOrder is required' })
      }

      const entry = await SprintPlanEntry.findByIdAndUpdate(req.params.id, update, { new: true }).populate(
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
