import { Router } from 'express'
import { Category } from '../models/Category.js'
import { Todo } from '../models/Todo.js'

export const todosRouter = Router()

const UNCATEGORIZED_NAME = 'Uncategorized'

// Resolved at creation time (not a static schema default) since the seeded
// Uncategorized category's id is only known at runtime, after boot-time seeding.
async function resolveDefaultCategoryId() {
  const uncategorized = await Category.findOne({ name: UNCATEGORIZED_NAME })
  return uncategorized?._id ?? uncategorized?.id ?? null
}

// POST /api/todos -> quick-create a todo (title only required). Optional
// priority/tags/body are passed through only when the client supplies them,
// so the schema-level defaults (priority: 'Medium', tags: [], body: null)
// are left to Mongoose rather than re-asserted here.
todosRouter.post('/', async (req, res, next) => {
  try {
    const { title, categoryId, dueDate, priority, tags, body } = req.body

    if (!title || !String(title).trim()) {
      return res.status(400).json({ error: 'title is required' })
    }

    const resolvedCategoryId = categoryId ?? (await resolveDefaultCategoryId())

    const todo = await Todo.create({
      title: String(title).trim(),
      categoryId: resolvedCategoryId,
      dueDate: dueDate ?? null,
      ...(priority !== undefined ? { priority } : {}),
      ...(tags !== undefined ? { tags } : {}),
      ...(body !== undefined ? { body } : {}),
    })
    res.status(201).json(todo)
  } catch (err) {
    next(err)
  }
})

// GET /api/todos -> list all todos
todosRouter.get('/', async (req, res, next) => {
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
todosRouter.get('/tags', async (req, res, next) => {
  try {
    const tags = await Todo.distinct('tags')
    const sorted = [...new Set(tags.filter(Boolean))].sort((a, b) => a.localeCompare(b))
    res.json(sorted)
  } catch (err) {
    next(err)
  }
})

// PATCH /api/todos/:id/toggle -> flip completed (complete <-> reopen)
todosRouter.patch('/:id/toggle', async (req, res, next) => {
  try {
    const todo = await Todo.findById(req.params.id)

    if (!todo) {
      return res.status(404).json({ error: 'Todo not found' })
    }

    todo.completed = !todo.completed
    await todo.save()
    res.json(todo)
  } catch (err) {
    next(err)
  }
})

// PATCH /api/todos/:id -> general update (title, categoryId, priority,
// dueDate, tags, body). Distinct from /:id/toggle, which stays dedicated to
// the checkbox action.
todosRouter.patch('/:id', async (req, res, next) => {
  try {
    const { title, categoryId, priority, dueDate, tags, body } = req.body

    if (title !== undefined && !String(title).trim()) {
      return res.status(400).json({ error: 'title is required' })
    }

    const update = {}
    if (title !== undefined) update.title = String(title).trim()
    if (categoryId !== undefined) update.categoryId = categoryId
    if (priority !== undefined) update.priority = priority
    if (dueDate !== undefined) update.dueDate = dueDate
    if (tags !== undefined) update.tags = tags
    if (body !== undefined) update.body = body

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
})

// DELETE /api/todos/:id -> delete a todo
todosRouter.delete('/:id', async (req, res, next) => {
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
