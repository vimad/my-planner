import { Router, type NextFunction, type Request, type Response } from 'express'
import { AtlasEpic } from '../models/AtlasEpic.ts'
import { AtlasTask } from '../models/AtlasTask.ts'
import { buildTaskTree, EpicNotFoundError, NotAnEpicError, trackAndSyncEpic } from '../services/atlasSync.ts'
import { resolveAtRisk } from '../utils/atlasRisk.ts'
import { toLocalDateString } from '../utils/localDate.ts'

export const atlasEpicsRouter = Router()

interface TrackEpicBody {
  jiraKey?: string
}

// POST /api/atlas/epics -> body { jiraKey }. Ticket 07's "track an epic":
// immediate, synchronous sync (spec §4.1) - resolves the key against Jira
// and, if it's a real Epic, recursively pulls its full task/sub-task tree
// (services/atlasSync.ts). An unresolvable key (404) or a non-Epic key (422)
// saves nothing - trackAndSyncEpic throws before touching Mongo in either
// case.
atlasEpicsRouter.post(
  '/',
  async (req: Request<Record<string, never>, unknown, TrackEpicBody>, res: Response, next: NextFunction) => {
    try {
      const jiraKey = req.body.jiraKey?.trim()
      if (!jiraKey) {
        return res.status(400).json({ error: 'jiraKey is required' })
      }

      const result = await trackAndSyncEpic(jiraKey)
      res.status(201).json(result)
    } catch (err) {
      if (err instanceof EpicNotFoundError) {
        return res.status(404).json({ error: err.message })
      }
      if (err instanceof NotAnEpicError) {
        return res.status(422).json({ error: err.message })
      }
      next(err)
    }
  },
)

// GET /api/atlas/epics -> every tracked epic (including archived - ticket
// 10's Dashboard toggle is responsible for filtering those out of the main
// list, not this route), each with its task/sub-task tree nested by
// parentTaskId (buildTaskTree). Progress/status-bucket counts and date range
// are deliberately not computed here - they're the Dashboard's job (ticket
// 08), derived at render time from each epic's tasks (spec §2).
//
// Each task's `atRisk` is overwritten here with its *effective* value
// (utils/atlasRisk.ts's resolveAtRisk) before the response is built - not a
// database write, purely a per-request projection, so the auto-risk rule
// stays reactive (flips the moment today crosses endDate) without needing a
// sync or any stored recompute step (ticket 09; see resolveAtRisk's own
// comment for the full rationale).
atlasEpicsRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const epics = await AtlasEpic.find().sort({ jiraKey: 1 })
    const today = toLocalDateString(new Date())

    const withTasks = await Promise.all(
      epics.map(async (epic) => {
        const tasks = await AtlasTask.find({ epicId: epic._id })
        const resolvedTasks = tasks.map((task) => {
          const obj = task.toObject()
          return { ...obj, atRisk: resolveAtRisk(obj, today) }
        })
        return { ...epic.toObject(), tasks: buildTaskTree(resolvedTasks) }
      }),
    )

    res.json(withTasks)
  } catch (err) {
    next(err)
  }
})
