import { Router, type NextFunction, type Request, type Response } from 'express'
import { AtlasEpic, type AtlasEpicDoc } from '../models/AtlasEpic.ts'
import { AtlasTask } from '../models/AtlasTask.ts'
import { buildTaskTree, EpicNotFoundError, NotAnEpicError, trackAndSyncEpic } from '../services/atlasSync.ts'
import { resolveAtRisk } from '../utils/atlasRisk.ts'
import { toLocalDateString } from '../utils/localDate.ts'
import { tiptapToPlainText, type TiptapNode } from '../utils/tiptapText.ts'

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

interface UpdateEpicBody {
  notes?: TiptapNode | null
  archived?: boolean
}

// PATCH /api/atlas/epics/:id -> ticket 10's epic-level surface: rich-text
// notes (+ its denormalized notesText, same convention as PATCH /api/atlas/
// tasks/:id) and the archived flag that both un-tracks an epic (`true`) and
// restores it (`false`) - a soft-delete, never a hard Mongo delete (spec
// §4.4). Partial update: only fields present in the body are touched, so
// e.g. saving a note never flips archived and vice versa.
atlasEpicsRouter.patch(
  '/:id',
  async (req: Request<{ id: string }, unknown, UpdateEpicBody>, res: Response, next: NextFunction) => {
    try {
      const { notes, archived } = req.body

      const update: Partial<AtlasEpicDoc> = {}
      if (notes !== undefined) {
        update.notes = notes
        update.notesText = tiptapToPlainText(notes)
      }
      if (archived !== undefined) update.archived = archived

      const epic = await AtlasEpic.findByIdAndUpdate(req.params.id, update, {
        returnDocument: 'after',
        runValidators: true,
      })

      if (!epic) {
        return res.status(404).json({ error: 'Epic not found' })
      }

      res.json(epic)
    } catch (err) {
      next(err)
    }
  },
)

// POST /api/atlas/epics/:id/sync -> ticket 10's per-epic "Sync now": looks
// the epic up locally (so the caller only needs its Atlas _id, not its
// jiraKey) and re-runs the exact same trackAndSyncEpic used for the initial
// track (spec §4.2 - "Sync now" is the only way data updates post-initial-
// sync; there is no lazy/background refresh anywhere in Atlas). Scoped to
// just this one epic's tree - trackAndSyncEpic's JQL (`parent = "<jiraKey>"`)
// and reconcileMissingTasks' AtlasTask.find are both epicId-scoped, so a
// resync here never touches any other epic's tasks.
atlasEpicsRouter.post('/:id/sync', async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
  try {
    const epic = await AtlasEpic.findById(req.params.id)
    if (!epic) {
      return res.status(404).json({ error: 'Epic not found' })
    }

    const result = await trackAndSyncEpic(epic.jiraKey)
    res.json(result)
  } catch (err) {
    if (err instanceof EpicNotFoundError) {
      return res.status(404).json({ error: err.message })
    }
    if (err instanceof NotAnEpicError) {
      return res.status(422).json({ error: err.message })
    }
    next(err)
  }
})

// POST /api/atlas/epics/sync-all -> ticket 10's global "sync all": the other
// half of spec §4.2's "manual only" refresh model - loops every tracked,
// *non-archived* epic (an archived one is un-tracked, so re-pulling its tree
// would contradict its whole point) and resyncs each in turn. One epic
// failing (e.g. its Jira issue itself got deleted since) is reported per-
// epic rather than aborting the whole run, so a single bad epic can't block
// every other epic's refresh.
atlasEpicsRouter.post('/sync-all', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const epics = await AtlasEpic.find({ archived: false })
    const synced: string[] = []
    const errors: { jiraKey: string; error: string }[] = []

    for (const epic of epics) {
      try {
        await trackAndSyncEpic(epic.jiraKey)
        synced.push(epic.jiraKey)
      } catch (err) {
        errors.push({ jiraKey: epic.jiraKey, error: (err as Error).message })
      }
    }

    res.json({ synced, errors })
  } catch (err) {
    next(err)
  }
})
