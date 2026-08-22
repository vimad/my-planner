import { Router, type NextFunction, type Request, type Response } from 'express'
import { AtlasPlanningEntry, type AtlasPlanningEntryDoc } from '../models/AtlasPlanningEntry.ts'

export const atlasPlanningEntriesRouter = Router()

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
}

// PATCH /api/atlas-planning-entries/:id -> ticket 01's reassign-to-a-
// different-person control (the badge/row's person-picker). Only
// rosterMemberId is accepted here - startDate/endDate patching is ticket 03's
// Gantt-drag-to-save surface, layered onto this same route later, not this
// ticket's scope.
atlasPlanningEntriesRouter.patch(
  '/:id',
  async (req: Request<{ id: string }, unknown, UpdatePlanningEntryBody>, res: Response, next: NextFunction) => {
    try {
      const { rosterMemberId } = req.body

      if (rosterMemberId !== undefined && !rosterMemberId.trim()) {
        return res.status(400).json({ error: 'rosterMemberId cannot be empty' })
      }

      const update: Partial<AtlasPlanningEntryDoc> = {}
      if (rosterMemberId !== undefined) {
        update.rosterMemberId = rosterMemberId as unknown as AtlasPlanningEntryDoc['rosterMemberId']
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
