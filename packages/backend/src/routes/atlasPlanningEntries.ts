import { Router, type NextFunction, type Request, type Response } from 'express'
import { AtlasPlanningEntry, type AtlasPlanningEntryDoc } from '../models/AtlasPlanningEntry.ts'
import { reconcilePlanningEntries } from '../services/atlasPlanningSync.ts'

export const atlasPlanningEntriesRouter = Router()

const DATE_SHAPE = /^\d{4}-\d{2}-\d{2}$/

// GET /api/atlas-planning-entries -> every board-derived planning entry,
// across every roster member, sorted so each person's own tickets come back
// together and in their assigned `order` (services/atlasPlanningSync.ts).
// Entries are never created directly through this router - see that
// service's own header comment for the two places that call it.
atlasPlanningEntriesRouter.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const entries = await AtlasPlanningEntry.find().sort({ rosterMemberId: 1, order: 1 })
    res.json(entries)
  } catch (err) {
    next(err)
  }
})

// POST /api/atlas-planning-entries/sync -> runs the same board-reconciliation
// pass a Board/Summary sync triggers (services/atlasPlanningSync.ts), then
// returns the refreshed list. The only caller is the Planning tab's own
// one-time initial load (useAtlasPlanning.ts): when GET comes back empty, it
// calls this once to seed entries from whatever To Do/In Progress tasks are
// already tracked - In Progress first per person, same ordering rule any
// other sync produces.
atlasPlanningEntriesRouter.post('/sync', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    await reconcilePlanningEntries()
    const entries = await AtlasPlanningEntry.find().sort({ rosterMemberId: 1, order: 1 })
    res.json(entries)
  } catch (err) {
    next(err)
  }
})

interface UpdatePlanningEntryBody {
  startDate?: string | null
  endDate?: string | null
}

// PATCH /api/atlas-planning-entries/:id -> ticket 03's Gantt drag-to-
// reschedule autosave, the only manual edit a planning entry still supports
// now that attach/reassign/remove are fully board-derived (see
// atlasPlanningSync.ts). startDate/endDate are nullable 'YYYY-MM-DD'
// strings - `null` is a legal value (clearing a date), checked separately
// from "absent" so a partial PATCH never clobbers the other field.
atlasPlanningEntriesRouter.patch(
  '/:id',
  async (req: Request<{ id: string }, unknown, UpdatePlanningEntryBody>, res: Response, next: NextFunction) => {
    try {
      const { startDate, endDate } = req.body

      if (startDate !== undefined && startDate !== null && !DATE_SHAPE.test(startDate)) {
        return res.status(400).json({ error: 'startDate must be a YYYY-MM-DD string or null' })
      }
      if (endDate !== undefined && endDate !== null && !DATE_SHAPE.test(endDate)) {
        return res.status(400).json({ error: 'endDate must be a YYYY-MM-DD string or null' })
      }

      const update: Partial<AtlasPlanningEntryDoc> = {}
      if (startDate !== undefined) update.startDate = startDate
      if (endDate !== undefined) update.endDate = endDate

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
