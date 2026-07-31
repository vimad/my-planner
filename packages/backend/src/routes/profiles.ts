import { Router, type NextFunction, type Request, type Response } from 'express'
import { Category } from '../models/Category.ts'
import { Profile } from '../models/Profile.ts'
import { ScratchNote } from '../models/ScratchNote.ts'
import { Todo } from '../models/Todo.ts'
import { seedUncategorizedCategory } from '../seed.ts'

export const profilesRouter = Router()

// Request body shape for create/update — client-supplied and unvalidated,
// so both fields are optional here even though the model requires `name`;
// the handlers below enforce presence before writing.
interface ProfileBody {
  name?: string
  color?: string
}

// POST /api/profiles -> create a profile, seeding its own per-profile
// "Uncategorized" category (mirrors the "every profile has one" invariant —
// see seedUncategorizedCategory in seed.ts).
profilesRouter.post(
  '/',
  async (req: Request<Record<string, never>, unknown, ProfileBody>, res: Response, next: NextFunction) => {
    try {
      const { name, color } = req.body

      if (!name) {
        return res.status(400).json({ error: 'name is required' })
      }

      const profile = await Profile.create({ name, color })
      await seedUncategorizedCategory(profile._id)

      res.status(201).json(profile)
    } catch (err) {
      next(err)
    }
  },
)

// GET /api/profiles -> list all profiles
profilesRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const profiles = await Profile.find().sort({ createdAt: 1 })
    res.json(profiles)
  } catch (err) {
    next(err)
  }
})

// PATCH /api/profiles/:id -> rename and/or recolor a profile
profilesRouter.patch(
  '/:id',
  async (req: Request<{ id: string }, unknown, ProfileBody>, res: Response, next: NextFunction) => {
    try {
      const { name, color } = req.body
      const update: ProfileBody = {}
      if (name !== undefined) update.name = name
      if (color !== undefined) update.color = color

      const profile = await Profile.findByIdAndUpdate(req.params.id, update, {
        new: true,
      })

      if (!profile) {
        return res.status(404).json({ error: 'Profile not found' })
      }

      res.json(profile)
    } catch (err) {
      next(err)
    }
  },
)

// DELETE /api/profiles/:id -> delete a profile and cascade-delete
// everything that lives inside it: its Categories, the Todos belonging to
// those Categories, and its ScratchNotes. There's no "Uncategorized"-style
// fallback profile to reparent orphans into, so this is a hard cascade.
// Blocked (400) when it's the only remaining profile — mirrors the existing
// "Uncategorized can't be deleted" guard on Category, since the app must
// never be left with nowhere for Categories/Todos to live.
profilesRouter.delete('/:id', async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
  try {
    const profile = await Profile.findById(req.params.id)

    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' })
    }

    const profileCount = await Profile.countDocuments()
    if (profileCount <= 1) {
      return res.status(400).json({ error: 'The last remaining profile cannot be deleted' })
    }

    const categories = await Category.find({ profileId: profile._id })
    const categoryIds = categories.map((category) => category._id)

    await Todo.deleteMany({ categoryId: { $in: categoryIds } })
    await Category.deleteMany({ profileId: profile._id })
    await ScratchNote.deleteMany({ profileId: profile._id })
    await Profile.findByIdAndDelete(req.params.id)

    res.status(204).end()
  } catch (err) {
    next(err)
  }
})
