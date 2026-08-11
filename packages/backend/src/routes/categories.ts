import { Router, type NextFunction, type Request, type Response } from 'express'
import mongoose from 'mongoose'
import { Category } from '../models/Category.ts'
import { requireProfileId } from '../utils/profileScope.ts'

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
      const { name, color } = req.body

      if (!name || !color) {
        return res.status(400).json({ error: 'name and color are required' })
      }

      const profileId = requireProfileId(req.body.profileId, res)
      if (!profileId) return

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
    const profileId = requireProfileId(req.query.profileId, res)
    if (!profileId) return

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

// PATCH /api/categories/:id?profileId=... -> rename and/or recolor a
// category. profileId is required and checked against the category's own
// profileId (404, not 400/403, so a mismatch reveals nothing about whether
// the id exists under a different profile) - otherwise a category id from
// one profile could be renamed/recolored while browsing another.
categoriesRouter.patch(
  '/:id',
  async (
    req: Request<{ id: string }, unknown, CategoryBody, { profileId?: string }>,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const profileId = requireProfileId(req.query.profileId, res)
      if (!profileId) return

      const { name, color } = req.body
      const update: CategoryBody = {}
      if (name !== undefined) update.name = name
      if (color !== undefined) update.color = color

      const category = await Category.findOneAndUpdate({ _id: req.params.id, profileId }, update, {
        returnDocument: 'after',
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

// DELETE /api/categories/:id?profileId=... -> delete a category (system
// categories are protected). profileId is required and checked against the
// category's own profileId, same reasoning as PATCH above.
categoriesRouter.delete(
  '/:id',
  async (req: Request<{ id: string }, unknown, unknown, { profileId?: string }>, res: Response, next: NextFunction) => {
    try {
      const profileId = requireProfileId(req.query.profileId, res)
      if (!profileId) return

      const category = await Category.findOne({ _id: req.params.id, profileId })

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
