import { Router, type NextFunction, type Request, type Response } from 'express'
import { AtlasEpic, type AtlasEpicDoc } from '../models/AtlasEpic.ts'
import { AtlasTask } from '../models/AtlasTask.ts'
import { reconcilePlanningEntries } from '../services/atlasPlanningSync.ts'
import {
  buildTaskTree,
  EpicNotFoundError,
  NotAnEpicError,
  TicketAlreadyTrackedError,
  trackAndSyncEpic,
  trackAndSyncStandaloneTask,
  trackAndSyncTicket,
} from '../services/atlasSync.ts'
import { resolveAtRisk } from '../utils/atlasRisk.ts'
import { toLocalDateString } from '../utils/localDate.ts'
import { tiptapToPlainText, type TiptapNode } from '../utils/tiptapText.ts'

export const atlasEpicsRouter = Router()

interface TrackTicketBody {
  jiraKey?: string
}

interface SyncManyResult {
  synced: string[]
  errors: { jiraKey: string; error: string }[]
}

// Shared "resync a batch, one bad item doesn't abort the rest" loop - used
// by the real-epics half of sync-all, the "Outside the program" root-ticket
// half of sync-all, and that same root-ticket loop for the "Outside the
// program" card's own per-epic "Sync now" below.
async function syncEach<T>(items: T[], jiraKeyOf: (item: T) => string, sync: (jiraKey: string) => Promise<unknown>): Promise<SyncManyResult> {
  const synced: string[] = []
  const errors: SyncManyResult['errors'] = []
  for (const item of items) {
    const jiraKey = jiraKeyOf(item)
    try {
      await sync(jiraKey)
      synced.push(jiraKey)
    } catch (err) {
      errors.push({ jiraKey, error: (err as Error).message })
    }
  }
  return { synced, errors }
}

// POST /api/atlas/epics -> body { jiraKey }. Ticket 07's "track an epic",
// generalized to "track any ticket": immediate, synchronous sync (spec
// §4.1) - resolves the key against Jira and, if it's an Epic, recursively
// pulls its full task/sub-task tree; any other issue type (Task/Story/Bug)
// is filed under the shared "Outside the program" epic instead
// (services/atlasSync.ts's trackAndSyncTicket). An unresolvable key (404)
// saves nothing; a key already tracked elsewhere (409) is refused rather
// than silently reparented.
atlasEpicsRouter.post(
  '/',
  async (req: Request<Record<string, never>, unknown, TrackTicketBody>, res: Response, next: NextFunction) => {
    try {
      const jiraKey = req.body.jiraKey?.trim()
      if (!jiraKey) {
        return res.status(400).json({ error: 'jiraKey is required' })
      }

      const result = await trackAndSyncTicket(jiraKey)
      await reconcilePlanningEntries()
      res.status(201).json(result)
    } catch (err) {
      if (err instanceof EpicNotFoundError) {
        return res.status(404).json({ error: err.message })
      }
      if (err instanceof NotAnEpicError) {
        return res.status(422).json({ error: err.message })
      }
      if (err instanceof TicketAlreadyTrackedError) {
        return res.status(409).json({ error: err.message })
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
//
// The synthetic "Outside the program" epic (isOutsideProgram) has no Jira
// issue of its own to resync against - its jiraKey is a sentinel. "Sync now"
// on that card instead resyncs each of its directly-tracked root tickets in
// turn (trackAndSyncStandaloneTask), same "one bad ticket doesn't abort the
// rest" contract as the global sync-all below.
atlasEpicsRouter.post('/:id/sync', async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
  try {
    const epic = await AtlasEpic.findById(req.params.id)
    if (!epic) {
      return res.status(404).json({ error: 'Epic not found' })
    }

    if (epic.isOutsideProgram) {
      const rootTasks = await AtlasTask.find({ epicId: epic._id, parentTaskId: null, archived: false })
      const { errors } = await syncEach(rootTasks, (task) => task.jiraKey, trackAndSyncStandaloneTask)
      const tasks = await AtlasTask.find({ epicId: epic._id })
      await reconcilePlanningEntries()
      return res.json({ epic, tasks, errors })
    }

    const result = await trackAndSyncEpic(epic.jiraKey)
    await reconcilePlanningEntries()
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

// DELETE /api/atlas/epics/:id -> permanently removes an already-archived
// epic and its tasks (a hard delete, unlike PATCH { archived: true }'s
// soft-delete un-track above). Only ever offered in the UI for epics already
// in the archived list, and guarded here too (400) so a stray call can't
// hard-delete a still-active epic out from under the main list.
atlasEpicsRouter.delete('/:id', async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
  try {
    const epic = await AtlasEpic.findById(req.params.id)
    if (!epic) {
      return res.status(404).json({ error: 'Epic not found' })
    }
    if (!epic.archived) {
      return res.status(400).json({ error: 'Only archived epics can be deleted' })
    }

    await AtlasTask.deleteMany({ epicId: epic._id })
    await AtlasEpic.findByIdAndDelete(req.params.id)
    res.status(204).end()
  } catch (err) {
    next(err)
  }
})

// POST /api/atlas/epics/sync-all -> ticket 10's global "sync all": the other
// half of spec §4.2's "manual only" refresh model - loops every tracked,
// *non-archived* real epic (an archived one is un-tracked, so re-pulling its
// tree would contradict its whole point) and resyncs each in turn. One epic
// failing (e.g. its Jira issue itself got deleted since) is reported per-
// epic rather than aborting the whole run, so a single bad epic can't block
// every other epic's refresh. Also resyncs every directly-tracked "Outside
// the program" root ticket the same way - excluded from the epic query
// itself (isOutsideProgram has no Jira issue of its own to resync against)
// and handled in its own loop below.
atlasEpicsRouter.post('/sync-all', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const epics = await AtlasEpic.find({ archived: false, isOutsideProgram: { $ne: true } })
    const epicResult = await syncEach(epics, (epic) => epic.jiraKey, trackAndSyncEpic)

    const outsideEpic = await AtlasEpic.findOne({ isOutsideProgram: true, archived: false })
    const rootTasks = outsideEpic
      ? await AtlasTask.find({ epicId: outsideEpic._id, parentTaskId: null, archived: false })
      : []
    const taskResult = await syncEach(rootTasks, (task) => task.jiraKey, trackAndSyncStandaloneTask)

    await reconcilePlanningEntries()

    res.json({
      synced: [...epicResult.synced, ...taskResult.synced],
      errors: [...epicResult.errors, ...taskResult.errors],
    })
  } catch (err) {
    next(err)
  }
})
