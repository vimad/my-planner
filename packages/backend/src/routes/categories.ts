import { Router, type NextFunction, type Request, type Response } from 'express'
import mongoose from 'mongoose'
import { Category } from '../models/Category.ts'

export const categoriesRouter = Router()

const UNCATEGORIZED_NAME = 'Uncategorized'

interface CategoryCounts {
  remaining: number
  completed: number
}

// Request body shape for create/update — client-supplied and unvalidated, so
// both fields are optional here even though the model requires them; the
// handlers below enforce presence before writing.
interface CategoryBody {
  name?: string
  color?: string
  profileId?: string
}

// Todo model doesn't exist until ticket 07. Compute counts defensively so
// this route works today (returning zeroes) and for real once Todo lands.
async function getCounts(categoryId: mongoose.Types.ObjectId | string): Promise<CategoryCounts> {
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

// POST /api/categories -> create a category, attached to the given profileId.
//
// profileId is required in the request body rather than resolved server-side
// (contrast resolveDefaultCategoryId's categoryId fallback in
// utils/defaultCategory.ts) because there's no server-side "active profile"
// concept to resolve against — per the Profiles spec, the active profile is
// pure client-side state (persisted to localStorage), so the client already
// has it in hand and is the only party that can supply it. This also keeps
// POST consistent with GET's required `profileId` query param below.
categoriesRouter.post(
  '/',
  async (req: Request<Record<string, never>, unknown, CategoryBody>, res: Response, next: NextFunction) => {
    try {
      const { name, color, profileId } = req.body

      if (!name || !color) {
        return res.status(400).json({ error: 'name and color are required' })
      }

      if (!profileId) {
        return res.status(400).json({ error: 'profileId is required' })
      }

      const category = await Category.create({ name, color, profileId })
      res.status(201).json(category)
    } catch (err) {
      next(err)
    }
  },
)

// GET /api/categories?profileId=... -> list a profile's categories with
// remaining/completed counts. profileId is required so a caller can never
// accidentally see another profile's categories by omitting it.
categoriesRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { profileId } = req.query

    if (!profileId || typeof profileId !== 'string') {
      return res.status(400).json({ error: 'profileId is required' })
    }

    const categories = await Category.find({ profileId }).sort({ createdAt: 1 })

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
categoriesRouter.patch(
  '/:id',
  async (req: Request<{ id: string }, unknown, CategoryBody>, res: Response, next: NextFunction) => {
    try {
      const { name, color } = req.body
      const update: CategoryBody = {}
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
  },
)

// DELETE /api/categories/:id -> delete a category (system categories are protected)
categoriesRouter.delete(
  '/:id',
  async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
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
  },
)
