import { Router, type NextFunction, type Request, type Response } from 'express'
import { AtlasPlanningEntry, type AtlasPlanningEntryDoc } from '../models/AtlasPlanningEntry.ts'

export const atlasPlanningEntriesRouter = Router()

const DATE_SHAPE = /^\d{4}-\d{2}-\d{2}$/

interface CreatePlanningEntryBody {
  rosterMemberId?: string
  jiraKey?: string
}

// POST /api/atlas-planning-entries -> attach a Jira key to an Atlas roster
// member's Planning-tab row (.scratch/atlas-planning-tab, ticket 01). Stores
// only the raw typed key - no Jira lookup is ever made here, per CLAUDE.md's
// read-only-Jira rule and the spec's "zero Jira API calls" decision.
atlasPlanningEntriesRouter.post(
  '/',
  async (req: Request<Record<string, never>, unknown, CreatePlanningEntryBody>, res: Response, next: NextFunction) => {
    try {
      const rosterMemberId = req.body.rosterMemberId?.trim()
      const jiraKey = req.body.jiraKey?.trim()

      if (!rosterMemberId) {
        return res.status(400).json({ error: 'rosterMemberId is required' })
      }
      if (!jiraKey) {
        return res.status(400).json({ error: 'jiraKey is required' })
      }

      const entry = await AtlasPlanningEntry.create({ rosterMemberId, jiraKey })
      res.status(201).json(entry)
    } catch (err) {
      next(err)
    }
  },
)

// GET /api/atlas-planning-entries -> every attached ticket, across every
// roster member, creation order. Deliberately flat/ungrouped, same posture
// as GET /api/atlas/roster returning the whole roster rather than a
// per-person tree - the frontend hook/component buckets these by
// rosterMemberId itself.
atlasPlanningEntriesRouter.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const entries = await AtlasPlanningEntry.find().sort({ createdAt: 1 })
    res.json(entries)
  } catch (err) {
    next(err)
  }
})

interface UpdatePlanningEntryBody {
  rosterMemberId?: string
  startDate?: string | null
  endDate?: string | null
}

// PATCH /api/atlas-planning-entries/:id -> both ticket 01's reassign-to-a-
// different-person control (the badge/row's person-picker) and ticket 03's
// Gantt drag-to-reschedule autosave. Each of rosterMemberId/startDate/
// endDate is only ever touched when actually present in the body (the same
// `!== undefined` convention rosterMemberId alone used before ticket 03),
// so a reassign PATCH never clobbers dates and a reschedule PATCH never
// clobbers the assignee. startDate/endDate are nullable 'YYYY-MM-DD'
// strings (ticket 01's model comment) - `null` is a legal value (clearing a
// date), so it's checked separately from "absent" rather than falling
// through the same falsy-string branch rosterMemberId uses.
atlasPlanningEntriesRouter.patch(
  '/:id',
  async (req: Request<{ id: string }, unknown, UpdatePlanningEntryBody>, res: Response, next: NextFunction) => {
    try {
      const { rosterMemberId, startDate, endDate } = req.body

      if (rosterMemberId !== undefined && !rosterMemberId.trim()) {
        return res.status(400).json({ error: 'rosterMemberId cannot be empty' })
      }
      if (startDate !== undefined && startDate !== null && !DATE_SHAPE.test(startDate)) {
        return res.status(400).json({ error: 'startDate must be a YYYY-MM-DD string or null' })
      }
      if (endDate !== undefined && endDate !== null && !DATE_SHAPE.test(endDate)) {
        return res.status(400).json({ error: 'endDate must be a YYYY-MM-DD string or null' })
      }

      const update: Partial<AtlasPlanningEntryDoc> = {}
      if (rosterMemberId !== undefined) {
        update.rosterMemberId = rosterMemberId as unknown as AtlasPlanningEntryDoc['rosterMemberId']
      }
      if (startDate !== undefined) {
        update.startDate = startDate
      }
      if (endDate !== undefined) {
        update.endDate = endDate
      }

      const entry = await AtlasPlanningEntry.findByIdAndUpdate(req.params.id, update, {
        returnDocument: 'after',
        runValidators: true,
      })

      if (!entry) {
        return res.status(404).json({ error: 'Planning entry not found' })
      }

      res.json(entry)
    } catch (err) {
      next(err)
    }
  },
)

// DELETE /api/atlas-planning-entries/:id -> removes an attached ticket from
// whichever person's row it's on. A hard delete, same as
// DELETE /api/atlas/roster/:id - there's no soft-delete/archive concept here.
atlasPlanningEntriesRouter.delete('/:id', async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
  try {
    const entry = await AtlasPlanningEntry.findByIdAndDelete(req.params.id)

    if (!entry) {
      return res.status(404).json({ error: 'Planning entry not found' })
    }

    res.status(204).end()
  } catch (err) {
    next(err)
  }
})
