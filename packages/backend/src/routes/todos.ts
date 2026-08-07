import { Router, type NextFunction, type Request, type Response } from 'express'
import { Category } from '../models/Category.ts'
import { Todo, type TodoDoc, type TodoPriority, type TodoRecurrence } from '../models/Todo.ts'
import { resolveDefaultCategoryId } from '../utils/defaultCategory.ts'
import { addDays, mondayOf, parseLocalDate, toLocalDateString } from '../utils/localDate.ts'
import { requireProfileId, resolveCategoryIdsForProfile } from '../utils/profileScope.ts'
import { tiptapToPlainText } from '../utils/tiptapText.ts'
import type { TiptapNode } from '../utils/tiptapText.ts'
import { computeWeeklySummaryBuckets, type WeeklySummaryTodoInput } from '../utils/weeklySummaryBuckets.ts'

export const todosRouter = Router()

// Client-supplied create/update payloads — unvalidated, so every field is
// optional here even though the model requires some of them; handlers below
// enforce/derive what's needed (title presence, default categoryId, etc.).
interface CreateTodoBody {
  title?: string
  categoryId?: string
  // Only used to resolve the default (Uncategorized) categoryId when
  // categoryId itself is omitted — see the POST handler below. Never stored
  // on the Todo itself (Todo has no direct profileId; see profileScope.ts).
  profileId?: string
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
      const { title, categoryId, profileId, dueDate, priority, tags, body, officeLinked } = req.body

      if (!title || !String(title).trim()) {
        return res.status(400).json({ error: 'title is required' })
      }

      // profileId is only needed to resolve the default (Uncategorized)
      // category when the client doesn't supply one explicitly (quick-add)
      // — a client that does supply categoryId (e.g. the full TodoDetail
      // form, which always has one) never needs to send profileId at all.
      if (!categoryId && !profileId) {
        return res.status(400).json({ error: 'profileId is required when no categoryId is provided' })
      }

      const resolvedCategoryId = categoryId ?? (await resolveDefaultCategoryId(profileId as string))

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

// GET /api/todos?profileId=... -> list a profile's todos. profileId is
// required (mirrors GET /api/categories's convention) so a caller can never
// accidentally see another profile's todos by omitting it. Todo has no
// direct profileId, so scoping goes through resolveCategoryIdsForProfile's
// categoryId -> Category.profileId join (see utils/profileScope.ts).
todosRouter.get(
  '/',
  async (
    req: Request<Record<string, never>, unknown, unknown, { profileId?: string }>,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const profileId = requireProfileId(req.query.profileId, res)
      if (!profileId) return

      const categoryIds = await resolveCategoryIdsForProfile(profileId)
      const todos = await Todo.find({ categoryId: { $in: categoryIds } }).sort({ createdAt: -1 })
      res.json(todos)
    } catch (err) {
      next(err)
    }
  },
)

// GET /api/todos/tags?profileId=... -> sorted list of distinct tags in use
// within a profile, for autocomplete — scoped the same way as GET / above so
// suggestions never leak another profile's tags. Must be registered before
// any /:id-shaped route so Express's param matcher doesn't swallow the
// literal "tags" segment as an :id.
todosRouter.get(
  '/tags',
  async (
    req: Request<Record<string, never>, unknown, unknown, { profileId?: string }>,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const profileId = requireProfileId(req.query.profileId, res)
      if (!profileId) return

      const categoryIds = await resolveCategoryIdsForProfile(profileId)
      const tags = await Todo.distinct('tags', { categoryId: { $in: categoryIds } })
      const sorted = [...new Set(tags.filter(Boolean))].sort((a, b) => a.localeCompare(b))
      res.json(sorted)
    } catch (err) {
      next(err)
    }
  },
)

// GET /api/todos/search?profileId=...&q=...&tags=... -> case-insensitive
// search over title and the denormalized bodyText extract (see
// utils/tiptapText.js), scoped to a profile the same way as GET / above.
// Simple regex match per the spec's explicit v1 guidance (no MongoDB text
// indexes needed at this data volume). A missing/empty q returns all of the
// profile's todos, which is the more useful default for a "type to filter"
// search box that starts empty. `tags` is a comma-separated list (mirrors
// notes.ts's `excludeIds` convention) narrowed with AND semantics ($all) -
// every listed tag must be present, on top of whatever q matches. Must be
// registered before any /:id-shaped route (see /tags above).
todosRouter.get(
  '/search',
  async (
    req: Request<Record<string, never>, unknown, unknown, { q?: string; tags?: string; profileId?: string }>,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const profileId = requireProfileId(req.query.profileId, res)
      if (!profileId) return

      const q = typeof req.query.q === 'string' ? req.query.q.trim() : ''
      const tags =
        typeof req.query.tags === 'string' && req.query.tags.length > 0 ? req.query.tags.split(',') : []
      const categoryIds = await resolveCategoryIdsForProfile(profileId)

      const filter: Record<string, unknown> = { categoryId: { $in: categoryIds } }
      if (q) {
        filter.$or = [{ title: { $regex: q, $options: 'i' } }, { bodyText: { $regex: q, $options: 'i' } }]
      }
      if (tags.length > 0) {
        filter.tags = { $all: tags }
      }

      const todos = await Todo.find(filter).sort({ createdAt: -1 })
      res.json(todos)
    } catch (err) {
      next(err)
    }
  },
)

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

// new Date(2026, 1, 30) silently rolls over to March instead of throwing, so
// validity means the round-tripped y/m/d match what was parsed, not just
// that the Date constructor didn't throw.
function isValidCalendarDate(iso: string): boolean {
  if (!ISO_DATE_RE.test(iso)) return false
  const [y, m, d] = iso.split('-').map(Number)
  const date = parseLocalDate(iso)
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d
}

// GET /api/todos/weekly-summary?profileId=...&date=... -> a profile's
// per-category weekly progress summary (completed/actioned/no-action todos)
// for the Mon-Sun week containing `date` (or the week containing the
// server's current date when `date` is omitted). Must be registered before
// any /:id-shaped route (see /tags above).
todosRouter.get(
  '/weekly-summary',
  async (
    req: Request<Record<string, never>, unknown, unknown, { profileId?: string; date?: string }>,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const profileId = requireProfileId(req.query.profileId, res)
      if (!profileId) return

      const rawDate = req.query.date
      let anchor: string
      if (rawDate) {
        if (!isValidCalendarDate(rawDate)) {
          return res.status(400).json({ error: 'date must be a valid YYYY-MM-DD date' })
        }
        anchor = rawDate
      } else {
        anchor = toLocalDateString(new Date())
      }

      const weekStart = mondayOf(anchor)
      const weekEnd = addDays(weekStart, 6)

      const categoryIds = await resolveCategoryIdsForProfile(profileId)
      const categories = await Category.find({ profileId }).sort({ createdAt: 1 })
      const todos = await Todo.find({ categoryId: { $in: categoryIds } })

      const todoInputs: WeeklySummaryTodoInput[] = todos.map((todo) => ({
        id: todo._id.toString(),
        title: todo.title,
        categoryId: todo.categoryId.toString(),
        completedAt: todo.completedAt,
        body: todo.body,
        createdAt: todo.createdAt,
      }))

      const buckets = computeWeeklySummaryBuckets(todoInputs, { weekStart, weekEnd })
      const bucketByCategoryId = new Map(buckets.map((bucket) => [bucket.categoryId, bucket]))

      const responseCategories = categories
        .map((category) => bucketByCategoryId.get((category._id ?? category.id).toString()))
        .filter(
          (bucket): bucket is (typeof buckets)[number] =>
            bucket !== undefined &&
            bucket.completed.length + bucket.actioned.length + bucket.noAction.length > 0,
        )

      res.json({ weekStart, weekEnd, categories: responseCategories })
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
    todo.completedAt = todo.completed ? new Date() : null
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
        completedAt: null,
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
