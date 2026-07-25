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

// POST /api/todos -> quick-create a todo (title only required)
todosRouter.post('/', async (req, res, next) => {
  try {
    const { title, categoryId, dueDate } = req.body

    if (!title || !String(title).trim()) {
      return res.status(400).json({ error: 'title is required' })
    }

    const resolvedCategoryId = categoryId ?? (await resolveDefaultCategoryId())

    const todo = await Todo.create({
      title: String(title).trim(),
      categoryId: resolvedCategoryId,
      dueDate: dueDate ?? null,
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
