import { randomUUID } from 'node:crypto'
import { Router, type NextFunction, type Request, type Response } from 'express'
import { ScratchNote, type ScratchLine } from '../models/ScratchNote.ts'
import { Todo, type TodoDoc, type TodoPriority } from '../models/Todo.ts'
import { resolveDefaultCategoryId } from '../utils/defaultCategory.ts'
import { requireProfileId } from '../utils/profileScope.ts'
import type { TiptapNode } from '../utils/tiptapText.ts'

export const scratchNotesRouter = Router()

// Shape of a line as supplied by the client (unvalidated) — narrower than
// ScratchLine, which also carries the server-owned promotedTodoId.
interface IncomingScratchLine {
  id?: string
  content?: TiptapNode | null
}

// Recursively walk a Tiptap JSON document/node and concatenate its text
// nodes. Doesn't need to be fancy (per the ticket) - just enough to turn a
// line's rich content into a plain-text Todo title.
function extractText(node: TiptapNode | TiptapNode[] | null | undefined): string {
  if (!node) return ''
  if (Array.isArray(node)) return node.map(extractText).join(' ').trim()
  if (node.type === 'text') return node.text ?? ''
  if (Array.isArray(node.content)) return node.content.map(extractText).join(' ').trim()
  return ''
}

// Normalizes client-supplied lines into the stored shape, assigning a fresh
// stable id to any line that doesn't already have one. Used on create, where
// there's no existing note to reconcile promotedTodoId against.
function normalizeNewLines(lines: unknown): Pick<ScratchLine, 'id' | 'content' | 'promotedTodoId'>[] {
  if (!Array.isArray(lines)) return []
  return (lines as IncomingScratchLine[]).map((line) => ({
    id: line?.id || randomUUID(),
    content: line?.content ?? null,
    promotedTodoId: null,
  }))
}

interface CreateScratchNoteBody {
  body?: unknown
  profileId?: string
}

interface PatchScratchNoteBody {
  body?: IncomingScratchLine[]
  archived?: boolean
}

interface ArchiveScratchNoteBody {
  archived?: boolean
}

interface PromoteLineBody {
  lineId?: string
  categoryId?: string
  priority?: TodoPriority
  dueDate?: string | null
}

// POST /api/scratch-notes -> create a note, optionally pre-seeded with lines
// (or start empty and add lines later via PATCH). profileId is required in
// the body, set directly (not derived) at creation - same convention as
// POST /api/categories, since there's no server-side "active profile"
// concept; the client already has it in hand.
scratchNotesRouter.post(
  '/',
  async (req: Request<Record<string, never>, unknown, CreateScratchNoteBody>, res: Response, next: NextFunction) => {
    try {
      const profileId = requireProfileId(req.body.profileId, res)
      if (!profileId) return

      const body = normalizeNewLines(req.body.body)
      const note = await ScratchNote.create({ body, profileId })
      res.status(201).json(note)
    } catch (err) {
      next(err)
    }
  },
)

// GET /api/scratch-notes?profileId=... -> list a profile's notes,
// non-archived by default (an inbox, not an archive browser). Pass
// ?includeArchived=true to see everything. profileId is required (mirrors
// GET /api/categories and /api/todos's convention) so a caller can never
// accidentally see another profile's notes by omitting it.
scratchNotesRouter.get(
  '/',
  async (
    req: Request<Record<string, never>, unknown, unknown, { includeArchived?: string; profileId?: string }>,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const profileId = requireProfileId(req.query.profileId, res)
      if (!profileId) return

      const filter =
        req.query.includeArchived === 'true' ? { profileId } : { profileId, archived: false }
      const notes = await ScratchNote.find(filter).sort({ createdAt: -1 })
      res.json(notes)
    } catch (err) {
      next(err)
    }
  },
)

// PATCH /api/scratch-notes/:id?profileId=... -> update a note's lines (full
// body replace, the simplest option per the ticket) and/or its archived
// flag. profileId is required and checked against the note's own profileId
// (404 on mismatch) so a note id from one profile can't be edited while
// browsing another. When replacing lines, promotedTodoId is always carried
// over from the existing line with the same id (never trusted from the
// client) so promotion state can't be clobbered by an unrelated
// line-content edit; unrecognized ids are treated as brand-new lines.
scratchNotesRouter.patch(
  '/:id',
  async (
    req: Request<{ id: string }, unknown, PatchScratchNoteBody, { profileId?: string }>,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const profileId = requireProfileId(req.query.profileId, res)
      if (!profileId) return

      const note = await ScratchNote.findOne({ _id: req.params.id, profileId })

      if (!note) {
        return res.status(404).json({ error: 'Scratch note not found' })
      }

      if (req.body.body !== undefined) {
        const existingById = new Map((note.body ?? []).map((line) => [line.id, line]))
        note.body = req.body.body.map((line) => {
          const existing = line?.id ? existingById.get(line.id) : undefined
          return {
            id: existing?.id ?? line?.id ?? randomUUID(),
            content: line?.content ?? null,
            promotedTodoId: existing?.promotedTodoId ?? null,
          }
        })
      }

      if (req.body.archived !== undefined) {
        note.archived = req.body.archived
      }

      await note.save()
      res.json(note)
    } catch (err) {
      next(err)
    }
  },
)

// PATCH /api/scratch-notes/:id/archive?profileId=... -> soft archive (or
// unarchive via { archived: false }); defaults to archiving. profileId is
// required and checked against the note's own profileId, same reasoning as
// the PATCH above.
scratchNotesRouter.patch(
  '/:id/archive',
  async (
    req: Request<{ id: string }, unknown, ArchiveScratchNoteBody, { profileId?: string }>,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const profileId = requireProfileId(req.query.profileId, res)
      if (!profileId) return

      const archived = req.body.archived !== undefined ? req.body.archived : true
      const note = await ScratchNote.findOneAndUpdate({ _id: req.params.id, profileId }, { archived }, { new: true })

      if (!note) {
        return res.status(404).json({ error: 'Scratch note not found' })
      }

      res.json(note)
    } catch (err) {
      next(err)
    }
  },
)

// DELETE /api/scratch-notes/:id?profileId=... -> hard delete. profileId is
// required and checked against the note's own profileId, same reasoning as
// the PATCH routes above.
scratchNotesRouter.delete(
  '/:id',
  async (req: Request<{ id: string }, unknown, unknown, { profileId?: string }>, res: Response, next: NextFunction) => {
    try {
      const profileId = requireProfileId(req.query.profileId, res)
      if (!profileId) return

      const note = await ScratchNote.findOne({ _id: req.params.id, profileId })

      if (!note) {
        return res.status(404).json({ error: 'Scratch note not found' })
      }

      await ScratchNote.findByIdAndDelete(req.params.id)
      res.status(204).end()
    } catch (err) {
      next(err)
    }
  },
)

// POST /api/scratch-notes/:id/promote -> promote a single line into its own
// Todo, assigning category/priority/dueDate at that moment (all optional).
// Sets the line's promotedTodoId so it stays visible, marked, in the note.
scratchNotesRouter.post(
  '/:id/promote',
  async (req: Request<{ id: string }, unknown, PromoteLineBody>, res: Response, next: NextFunction) => {
    try {
      const { lineId, categoryId, priority, dueDate } = req.body

      if (!lineId) {
        return res.status(400).json({ error: 'lineId is required' })
      }

      const note = await ScratchNote.findById(req.params.id)

      if (!note) {
        return res.status(404).json({ error: 'Scratch note not found' })
      }

      const line = (note.body ?? []).find((l) => l.id === lineId)

      if (!line) {
        return res.status(404).json({ error: 'Line not found' })
      }

      if (line.promotedTodoId) {
        return res.status(400).json({ error: 'Line has already been promoted' })
      }

      const title = extractText(line.content).trim() || 'Untitled'
      // note.profileId is always set (required field) — a promoted todo's
      // default category comes from the note's own profile's Uncategorized,
      // never a global one, now that Uncategorized is per-profile.
      const resolvedCategoryId = categoryId ?? (await resolveDefaultCategoryId(note.profileId))

      const todo = await Todo.create({
        title,
        // resolveDefaultCategoryId()'s return type admits null (Uncategorized
        // missing at boot is theoretically possible); categoryId is a
        // required schema field with no static default, same as the
        // untyped .js behavior — cast preserves that runtime contract
        // without widening the model's ObjectId type.
        categoryId: resolvedCategoryId as unknown as TodoDoc['categoryId'],
        dueDate: dueDate ?? null,
        ...(priority !== undefined ? { priority } : {}),
      })

      // todo._id is always set on a freshly-created document; the ?? todo.id
      // fallback from the original JS is vestigial (kept in spirit, but a
      // direct assignment is the one that satisfies ScratchLine's
      // Types.ObjectId-typed promotedTodoId field without a cast).
      line.promotedTodoId = todo._id
      await note.save()

      res.status(201).json({ todo, note })
    } catch (err) {
      next(err)
    }
  },
)
