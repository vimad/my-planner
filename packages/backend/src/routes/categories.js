import { Router } from 'express'
import mongoose from 'mongoose'
import { Category } from '../models/Category.js'

export const categoriesRouter = Router()

const UNCATEGORIZED_NAME = 'Uncategorized'

// Todo model doesn't exist until ticket 07. Compute counts defensively so
// this route works today (returning zeroes) and for real once Todo lands.
async function getCounts(categoryId) {
  if (!mongoose.modelNames().includes('Todo')) {
    return { remaining: 0, completed: 0 }
  }

  try {
    const Todo = mongoose.model('Todo')
    const [remaining, completed] = await Promise.all([
      Todo.countDocuments({ categoryId, completed: false }),
      Todo.countDocuments({ categoryId, completed: true }),
    ])
    return { remaining, completed }
  } catch {
    return { remaining: 0, completed: 0 }
  }
}

// POST /api/categories -> create a category
categoriesRouter.post('/', async (req, res, next) => {
  try {
    const { name, color } = req.body

    if (!name || !color) {
      return res.status(400).json({ error: 'name and color are required' })
    }

    const category = await Category.create({ name, color })
    res.status(201).json(category)
  } catch (err) {
    next(err)
  }
})

// GET /api/categories -> list all categories with remaining/completed counts
categoriesRouter.get('/', async (req, res, next) => {
  try {
    const categories = await Category.find().sort({ createdAt: 1 })

    const withCounts = await Promise.all(
      categories.map(async (category) => {
        const counts = await getCounts(category._id ?? category.id)
        return { ...category.toObject(), ...counts }
      }),
    )

    res.json(withCounts)
  } catch (err) {
    next(err)
  }
})

// PATCH /api/categories/:id -> rename and/or recolor a category
categoriesRouter.patch('/:id', async (req, res, next) => {
  try {
    const { name, color } = req.body
    const update = {}
    if (name !== undefined) update.name = name
    if (color !== undefined) update.color = color

    const category = await Category.findByIdAndUpdate(req.params.id, update, {
      new: true,
    })

    if (!category) {
      return res.status(404).json({ error: 'Category not found' })
    }

    res.json(category)
  } catch (err) {
    next(err)
  }
})

// DELETE /api/categories/:id -> delete a category (system categories are protected)
categoriesRouter.delete('/:id', async (req, res, next) => {
  try {
    const category = await Category.findById(req.params.id)

    if (!category) {
      return res.status(404).json({ error: 'Category not found' })
    }

    if (category.system || category.name === UNCATEGORIZED_NAME) {
      return res.status(400).json({ error: 'The Uncategorized category cannot be deleted' })
    }

    await Category.findByIdAndDelete(req.params.id)
    res.status(204).end()
  } catch (err) {
    next(err)
  }
})
