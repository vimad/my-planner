import { Router, type NextFunction, type Request, type Response } from 'express'
import type { Types } from 'mongoose'
import { CapacityEntry } from '../models/CapacityEntry.ts'
import { TeamMembership } from '../models/TeamMembership.ts'
import { TeamSprintPlan } from '../models/TeamSprintPlan.ts'
import { computeWorkingDates } from '../services/sprintWorkingDays.ts'
import type { LeaveEntry, LeavePortion } from '../services/leaveEntries.ts'
import { isDuplicateKeyError } from '../utils/mongoErrors.ts'

export const capacityEntriesRouter = Router()

// Request body shape for create/update — client-supplied and unvalidated, so
// fields are optional here even though the model requires most of them; the
// handlers below enforce presence before writing.
interface CapacityEntryBody {
  teamMembershipId?: string
  sprintId?: string
  leaveEntries?: LeaveEntry[]
}

function isValidPortion(portion: unknown): portion is LeavePortion {
  return portion === 'full' || portion === 'half'
}

// Every entry has a plain 'YYYY-MM-DD' `date` string and a 'full'/'half'
// `portion` - shape validation only, doesn't check the date is actually one
// of the sprint's working dates (that's validateAgainstWorkingDates below).
function isWellFormedLeaveEntries(value: unknown): value is LeaveEntry[] {
  if (!Array.isArray(value)) return false
  return value.every(
    (e) => e && typeof e === 'object' && typeof (e as LeaveEntry).date === 'string' && isValidPortion((e as LeaveEntry).portion),
  )
}

// PATCH's date-in-range check: looks up the CapacityEntry's teamMembershipId
// -> TeamMembership.teamId, then that team's TeamSprintPlan for the entry's
// own sprintId, to get the current startDate/endDate/holidays and run
// computeWorkingDates. Returns an error message, or null when every entry's
// date falls within the sprint's current working dates.
async function validateAgainstWorkingDates(
  teamMembershipId: Types.ObjectId,
  sprintId: Types.ObjectId,
  entries: LeaveEntry[],
): Promise<string | null> {
  const membership = await TeamMembership.findById(teamMembershipId)
  if (!membership) return 'Capacity entry has no matching team membership'

  const plan = await TeamSprintPlan.findOne({ teamId: membership.teamId, sprintId })
  const workingDates =
    plan?.startDate && plan?.endDate ? computeWorkingDates(plan.startDate, plan.endDate, plan.holidays) : []
  const workingSet = new Set(workingDates)

  const outOfRange = entries.find((e) => !workingSet.has(e.date))
  if (outOfRange) {
    return `${outOfRange.date} is not one of this sprint's current working dates`
  }
  return null
}

// POST /api/capacity-entries -> record a membership's leave for a sprint.
// Rejects a duplicate (teamMembershipId, sprintId) pair with 409 — enforced
// by the model's unique compound index.
capacityEntriesRouter.post(
  '/',
  async (req: Request<Record<string, never>, unknown, CapacityEntryBody>, res: Response, next: NextFunction) => {
    try {
      const { teamMembershipId, sprintId, leaveEntries } = req.body

      if (!teamMembershipId || !sprintId) {
        return res.status(400).json({ error: 'teamMembershipId and sprintId are required' })
      }
      if (leaveEntries !== undefined && !isWellFormedLeaveEntries(leaveEntries)) {
        return res.status(400).json({ error: 'leaveEntries must be an array of { date, portion } with portion "full" or "half"' })
      }

      const entry = await CapacityEntry.create({ teamMembershipId, sprintId, leaveEntries: leaveEntries ?? [] })
      res.status(201).json(entry)
    } catch (err) {
      if (isDuplicateKeyError(err)) {
        return res.status(409).json({ error: 'A capacity entry already exists for this membership and sprint' })
      }
      next(err)
    }
  },
)

// GET /api/capacity-entries?teamMembershipId=&sprintId= -> the single entry
// for that pair, or 404 if no leave has been entered yet.
capacityEntriesRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { teamMembershipId, sprintId } = req.query

    if (!teamMembershipId || typeof teamMembershipId !== 'string' || !sprintId || typeof sprintId !== 'string') {
      return res.status(400).json({ error: 'teamMembershipId and sprintId are required' })
    }

    const entry = await CapacityEntry.findOne({ teamMembershipId, sprintId })
    if (!entry) {
      return res.status(404).json({ error: 'Capacity entry not found' })
    }

    res.json(entry)
  } catch (err) {
    next(err)
  }
})

// PATCH /api/capacity-entries/:id -> full-array replacement of leaveEntries
// (the grid always holds and sends a person's complete leave set for the
// sprint, not a single-cell diff). Validates every entry's date falls
// within the sprint's *current* working dates and every portion is
// 'full'/'half'.
capacityEntriesRouter.patch(
  '/:id',
  async (req: Request<{ id: string }, unknown, CapacityEntryBody>, res: Response, next: NextFunction) => {
    try {
      const { leaveEntries } = req.body

      if (!isWellFormedLeaveEntries(leaveEntries)) {
        return res.status(400).json({ error: 'leaveEntries must be an array of { date, portion } with portion "full" or "half"' })
      }

      const existing = await CapacityEntry.findById(req.params.id)
      if (!existing) {
        return res.status(404).json({ error: 'Capacity entry not found' })
      }

      const rangeError = await validateAgainstWorkingDates(existing.teamMembershipId, existing.sprintId, leaveEntries)
      if (rangeError) {
        return res.status(400).json({ error: rangeError })
      }

      const entry = await CapacityEntry.findByIdAndUpdate(req.params.id, { leaveEntries }, { returnDocument: 'after' })

      if (!entry) {
        return res.status(404).json({ error: 'Capacity entry not found' })
      }

      res.json(entry)
    } catch (err) {
      next(err)
    }
  },
)
