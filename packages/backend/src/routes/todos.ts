import { Router, type NextFunction, type Request, type Response } from 'express'
import { Todo, type TodoDoc, type TodoPriority, type TodoRecurrence } from '../models/Todo.ts'
import { resolveDefaultCategoryId } from '../utils/defaultCategory.ts'
import { tiptapToPlainText } from '../utils/tiptapText.ts'
import type { TiptapNode } from '../utils/tiptapText.ts'

export const todosRouter = Router()

// Client-supplied create/update payloads — unvalidated, so every field is
// optional here even though the model requires some of them; handlers below
// enforce/derive what's needed (title presence, default categoryId, etc.).
interface CreateTodoBody {
  title?: string
  categoryId?: string
  dueDate?: string | null
  priority?: TodoPriority
  tags?: string[]
  body?: TiptapNode | null
  officeLinked?: boolean
}

interface UpdateTodoBody extends CreateTodoBody {
  recurrence?: TodoRecurrence | null
  linkedTodoIds?: string[]
}

// Advances a local YYYY-MM-DD calendar-day string by a recurrence pattern's
// interval. Parses via new Date(year, month - 1, day) (local time) rather
// than new Date(dateString) (parsed as UTC), then re-serializes from
// getFullYear()/getMonth()/getDate() rather than toISOString(), to avoid the
// day-shift bug called out in the spec's technical constraint.
function advanceDueDate(dueDate: string, pattern: TodoRecurrence['pattern']): string {
  const [year, month, day] = dueDate.split('-').map(Number)
  const date = new Date(year, month - 1, day)

  if (pattern === 'daily') {
    date.setDate(date.getDate() + 1)
  } else if (pattern === 'weekly') {
    date.setDate(date.getDate() + 7)
  } else if (pattern === 'monthly') {
    date.setMonth(date.getMonth() + 1)
  }

  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

// POST /api/todos -> quick-create a todo (title only required). Optional
// priority/tags/body are passed through only when the client supplies them,
// so the schema-level defaults (priority: 'Medium', tags: [], body: null)
// are left to Mongoose rather than re-asserted here.
todosRouter.post(
  '/',
  async (req: Request<Record<string, never>, unknown, CreateTodoBody>, res: Response, next: NextFunction) => {
    try {
      const { title, categoryId, dueDate, priority, tags, body, officeLinked } = req.body

      if (!title || !String(title).trim()) {
        return res.status(400).json({ error: 'title is required' })
      }

      const resolvedCategoryId = categoryId ?? (await resolveDefaultCategoryId())

      const todo = await Todo.create({
        title: String(title).trim(),
        // See the matching comment in routes/scratchNotes.ts's /promote
        // handler: resolveDefaultCategoryId() admits null, categoryId is a
        // required field with no static default.
        categoryId: resolvedCategoryId as unknown as TodoDoc['categoryId'],
        dueDate: dueDate ?? null,
        ...(priority !== undefined ? { priority } : {}),
        ...(tags !== undefined ? { tags } : {}),
        ...(body !== undefined ? { body, bodyText: tiptapToPlainText(body) } : {}),
        ...(officeLinked !== undefined ? { officeLinked } : {}),
      })
      res.status(201).json(todo)
    } catch (err) {
      next(err)
    }
  },
)

// GET /api/todos -> list all todos
todosRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const todos = await Todo.find().sort({ createdAt: -1 })
    res.json(todos)
  } catch (err) {
    next(err)
  }
})

// GET /api/todos/tags -> sorted list of distinct tags in use, for autocomplete.
// Must be registered before any /:id-shaped route so Express's param matcher
// doesn't swallow the literal "tags" segment as an :id.
todosRouter.get('/tags', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tags = await Todo.distinct('tags')
    const sorted = [...new Set(tags.filter(Boolean))].sort((a, b) => a.localeCompare(b))
    res.json(sorted)
  } catch (err) {
    next(err)
  }
})

// GET /api/todos/search?q=... -> case-insensitive search over title and the
// denormalized bodyText extract (see utils/tiptapText.js). Simple regex
// match per the spec's explicit v1 guidance (no MongoDB text indexes needed
// at this data volume). A missing/empty q returns all todos, which is the
// more useful default for a "type to filter" search box that starts empty.
// Must be registered before any /:id-shaped route (see /tags above).
todosRouter.get(
  '/search',
  async (
    req: Request<Record<string, never>, unknown, unknown, { q?: string }>,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const q = typeof req.query.q === 'string' ? req.query.q.trim() : ''

      const filter = q
        ? { $or: [{ title: { $regex: q, $options: 'i' } }, { bodyText: { $regex: q, $options: 'i' } }] }
        : {}

      const todos = await Todo.find(filter).sort({ createdAt: -1 })
      res.json(todos)
    } catch (err) {
      next(err)
    }
  },
)

// PATCH /api/todos/:id/toggle -> flip completed (complete <-> reopen).
// On the false -> true transition, if the todo has a non-null recurrence and
// a dueDate, a new instance is cloned and its dueDate advanced by the
// pattern's interval — see the spec's "Recurring todo mechanics" section.
// The completed instance itself is left otherwise unchanged; recurrence only
// advances forward (reopening never spawns a new instance).
// Deliberately never touches any other todo's linkedTodoIds — see the
// no-cascade invariant on that field in models/Todo.ts.
todosRouter.patch('/:id/toggle', async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
  try {
    const todo = await Todo.findById(req.params.id)

    if (!todo) {
      return res.status(404).json({ error: 'Todo not found' })
    }

    const wasCompleted = todo.completed
    todo.completed = !todo.completed
    await todo.save()

    if (!wasCompleted && todo.completed && todo.recurrence && todo.dueDate) {
      await Todo.create({
        title: todo.title,
        categoryId: todo.categoryId,
        priority: todo.priority,
        tags: todo.tags,
        body: todo.body,
        bodyText: todo.bodyText,
        recurrence: todo.recurrence,
        completed: false,
        dueDate: advanceDueDate(todo.dueDate, todo.recurrence.pattern),
      })
    }

    res.json(todo)
  } catch (err) {
    next(err)
  }
})

// PATCH /api/todos/:id -> general update (title, categoryId, priority,
// dueDate, tags, body, recurrence, officeLinked, linkedTodoIds). Distinct
// from /:id/toggle, which stays dedicated to the checkbox action. Turning
// recurrence off is just a normal update with recurrence: null — there's no
// separate "series" entity.
todosRouter.patch(
  '/:id',
  async (req: Request<{ id: string }, unknown, UpdateTodoBody>, res: Response, next: NextFunction) => {
    try {
      const { title, categoryId, priority, dueDate, tags, body, recurrence, officeLinked, linkedTodoIds } =
        req.body

      if (title !== undefined && !String(title).trim()) {
        return res.status(400).json({ error: 'title is required' })
      }

      const update: Partial<TodoDoc> = {}
      if (title !== undefined) update.title = String(title).trim()
      if (categoryId !== undefined) update.categoryId = categoryId as unknown as TodoDoc['categoryId']
      if (priority !== undefined) update.priority = priority
      if (dueDate !== undefined) update.dueDate = dueDate
      if (tags !== undefined) update.tags = tags
      if (body !== undefined) {
        update.body = body
        update.bodyText = tiptapToPlainText(body)
      }
      if (recurrence !== undefined) update.recurrence = recurrence
      if (officeLinked !== undefined) update.officeLinked = officeLinked
      if (linkedTodoIds !== undefined) update.linkedTodoIds = linkedTodoIds as unknown as TodoDoc['linkedTodoIds']

      const todo = await Todo.findByIdAndUpdate(req.params.id, update, {
        new: true,
        runValidators: true,
      })

      if (!todo) {
        return res.status(404).json({ error: 'Todo not found' })
      }

      res.json(todo)
    } catch (err) {
      next(err)
    }
  },
)

// DELETE /api/todos/:id -> delete a todo. Deliberately never touches any
// other todo's linkedTodoIds — see the no-cascade invariant on that field in
// models/Todo.ts. A dangling reference to this id in some other todo's
// linkedTodoIds is left as-is; the frontend tolerates unresolved links.
todosRouter.delete('/:id', async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
  try {
    const todo = await Todo.findById(req.params.id)

    if (!todo) {
      return res.status(404).json({ error: 'Todo not found' })
    }

    await Todo.findByIdAndDelete(req.params.id)
    res.status(204).end()
  } catch (err) {
    next(err)
  }
})
