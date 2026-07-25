import { randomUUID } from 'node:crypto'
import { Router } from 'express'
import { Category } from '../models/Category.js'
import { ScratchNote } from '../models/ScratchNote.js'
import { Todo } from '../models/Todo.js'

export const scratchNotesRouter = Router()

const UNCATEGORIZED_NAME = 'Uncategorized'

// Same pattern as todos.js's resolveDefaultCategoryId: the seeded
// Uncategorized category's id is only known at runtime, so it's resolved
// here rather than baked into a schema default. Duplicated locally (rather
// than importing from todos.js) since it isn't exported there.
async function resolveDefaultCategoryId() {
  const uncategorized = await Category.findOne({ name: UNCATEGORIZED_NAME })
  return uncategorized?._id ?? uncategorized?.id ?? null
}

// Recursively walk a Tiptap JSON document/node and concatenate its text
// nodes. Doesn't need to be fancy (per the ticket) - just enough to turn a
// line's rich content into a plain-text Todo title.
function extractText(node) {
  if (!node) return ''
  if (Array.isArray(node)) return node.map(extractText).join(' ').trim()
  if (node.type === 'text') return node.text ?? ''
  if (Array.isArray(node.content)) return node.content.map(extractText).join(' ').trim()
  return ''
}

// Normalizes client-supplied lines into the stored shape, assigning a fresh
// stable id to any line that doesn't already have one. Used on create, where
// there's no existing note to reconcile promotedTodoId against.
function normalizeNewLines(lines) {
  if (!Array.isArray(lines)) return []
  return lines.map((line) => ({
    id: line?.id || randomUUID(),
    content: line?.content ?? null,
    promotedTodoId: null,
  }))
}

// POST /api/scratch-notes -> create a note, optionally pre-seeded with lines
// (or start empty and add lines later via PATCH).
scratchNotesRouter.post('/', async (req, res, next) => {
  try {
    const body = normalizeNewLines(req.body.body)
    const note = await ScratchNote.create({ body })
    res.status(201).json(note)
  } catch (err) {
    next(err)
  }
})

// GET /api/scratch-notes -> list notes, non-archived by default (an inbox,
// not an archive browser). Pass ?includeArchived=true to see everything.
scratchNotesRouter.get('/', async (req, res, next) => {
  try {
    const filter = req.query.includeArchived === 'true' ? {} : { archived: false }
    const notes = await ScratchNote.find(filter).sort({ createdAt: -1 })
    res.json(notes)
  } catch (err) {
    next(err)
  }
})

// PATCH /api/scratch-notes/:id -> update a note's lines (full body replace,
// the simplest option per the ticket) and/or its archived flag. When
// replacing lines, promotedTodoId is always carried over from the existing
// line with the same id (never trusted from the client) so promotion state
// can't be clobbered by an unrelated line-content edit; unrecognized ids are
// treated as brand-new lines.
scratchNotesRouter.patch('/:id', async (req, res, next) => {
  try {
    const note = await ScratchNote.findById(req.params.id)

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
})

// PATCH /api/scratch-notes/:id/archive -> soft archive (or unarchive via
// { archived: false }); defaults to archiving.
scratchNotesRouter.patch('/:id/archive', async (req, res, next) => {
  try {
    const archived = req.body.archived !== undefined ? req.body.archived : true
    const note = await ScratchNote.findByIdAndUpdate(req.params.id, { archived }, { new: true })

    if (!note) {
      return res.status(404).json({ error: 'Scratch note not found' })
    }

    res.json(note)
  } catch (err) {
    next(err)
  }
})

// DELETE /api/scratch-notes/:id -> hard delete
scratchNotesRouter.delete('/:id', async (req, res, next) => {
  try {
    const note = await ScratchNote.findById(req.params.id)

    if (!note) {
      return res.status(404).json({ error: 'Scratch note not found' })
    }

    await ScratchNote.findByIdAndDelete(req.params.id)
    res.status(204).end()
  } catch (err) {
    next(err)
  }
})

// POST /api/scratch-notes/:id/promote -> promote a single line into its own
// Todo, assigning category/priority/dueDate at that moment (all optional).
// Sets the line's promotedTodoId so it stays visible, marked, in the note.
scratchNotesRouter.post('/:id/promote', async (req, res, next) => {
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
    const resolvedCategoryId = categoryId ?? (await resolveDefaultCategoryId())

    const todo = await Todo.create({
      title,
      categoryId: resolvedCategoryId,
      dueDate: dueDate ?? null,
      ...(priority !== undefined ? { priority } : {}),
    })

    line.promotedTodoId = todo._id ?? todo.id
    await note.save()

    res.status(201).json({ todo, note })
  } catch (err) {
    next(err)
  }
})
