import { Router, type NextFunction, type Request, type Response } from 'express'
import { AtlasTask, type AtlasTaskDoc } from '../models/AtlasTask.ts'
import { tiptapToPlainText, type TiptapNode } from '../utils/tiptapText.ts'

export const atlasTasksRouter = Router()

// Client-supplied partial-update payload — every field optional, mirroring
// routes/todos.ts's PATCH /:id convention (only fields actually present are
// touched). Every one of these is Atlas-local (spec §2) — this route never
// calls Jira, per CLAUDE.md's "Data flows one way only: Jira -> app" rule.
interface UpdateAtlasTaskBody {
  startDate?: string | null
  endDate?: string | null
  notes?: TiptapNode | null
  // Presence (not value) is what matters: sending this key at all is what
  // makes the override sticky (see below) — a caller that only means to
  // touch dates/notes/blockedBy must omit this key entirely, not send the
  // task's current computed value.
  atRisk?: boolean
  blockedBy?: string[]
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

// Mirrors routes/todos.ts's isValidCalendarDate: new Date(y, m-1, d) silently
// rolls an invalid day/month over (e.g. Feb 30 -> Mar 2) instead of
// throwing, so validity means the round-tripped y/m/d match what was parsed.
function isValidCalendarDateString(value: string): boolean {
  if (!ISO_DATE_RE.test(value)) return false
  const [y, m, d] = value.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d
}

// PATCH /api/atlas/tasks/:id -> ticket 09's task-editing surface: manual
// start/end dates, rich-text notes (+ its denormalized notesText search/
// indicator extract, mirroring Todo.body/bodyText), an at-risk manual
// override, and blocked-by links to any task in any epic (no cycle
// validation, ever — spec §5.3). Partial update: only fields present in the
// body are written, so e.g. saving a note never touches atRisk/blockedBy.
//
// atRisk is the one field with override semantics: setting it here also
// flips atRiskOverride to true in the same write, which is what makes the
// override survive every later Jira resync (atlasSync.ts's upsertAtlasTask
// only ever $setOnInsert's both fields — see its comment, and
// utils/atlasRisk.ts's resolveAtRisk for how the effective value is read
// back out). There is no way to *un*-override back to the auto rule via
// this route — not asked for by the ticket/spec, and matches the spec's
// framing of the override as a one-way, sticky action.
atlasTasksRouter.patch(
  '/:id',
  async (req: Request<{ id: string }, unknown, UpdateAtlasTaskBody>, res: Response, next: NextFunction) => {
    try {
      const { startDate, endDate, notes, atRisk, blockedBy } = req.body

      if (startDate !== undefined && startDate !== null && !isValidCalendarDateString(startDate)) {
        return res.status(400).json({ error: 'startDate must be a valid YYYY-MM-DD date or null' })
      }
      if (endDate !== undefined && endDate !== null && !isValidCalendarDateString(endDate)) {
        return res.status(400).json({ error: 'endDate must be a valid YYYY-MM-DD date or null' })
      }

      const update: Partial<AtlasTaskDoc> = {}
      if (startDate !== undefined) update.startDate = startDate
      if (endDate !== undefined) update.endDate = endDate
      if (notes !== undefined) {
        update.notes = notes
        update.notesText = tiptapToPlainText(notes)
      }
      if (atRisk !== undefined) {
        update.atRisk = atRisk
        update.atRiskOverride = true
      }
      if (blockedBy !== undefined) {
        update.blockedBy = blockedBy as unknown as AtlasTaskDoc['blockedBy']
      }

      const task = await AtlasTask.findByIdAndUpdate(req.params.id, update, {
        returnDocument: 'after',
        runValidators: true,
      })

      if (!task) {
        return res.status(404).json({ error: 'Task not found' })
      }

      res.json(task)
    } catch (err) {
      next(err)
    }
  },
)
