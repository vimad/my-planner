import { Router, type NextFunction, type Request, type Response } from 'express'
import { AtlasRosterMember } from '../models/AtlasRosterMember.ts'
import { isDuplicateKeyError } from '../utils/mongoErrors.ts'

export const atlasRosterRouter = Router()

// Request body shape for create — client-supplied and unvalidated, so the
// field is optional here even though the model requires it; the handler
// below enforces presence before writing.
interface AtlasRosterMemberBody {
  personId?: string
}

// POST /api/atlas/roster -> add a person to Atlas's roster. Rejects a
// duplicate personId with 409 (enforced by the model's unique index) - a
// person can only be on Atlas's one roster once.
atlasRosterRouter.post(
  '/',
  async (req: Request<Record<string, never>, unknown, AtlasRosterMemberBody>, res: Response, next: NextFunction) => {
    try {
      const { personId } = req.body

      if (!personId) {
        return res.status(400).json({ error: 'personId is required' })
      }

      const member = await AtlasRosterMember.create({ personId })
      res.status(201).json(member)
    } catch (err) {
      if (isDuplicateKeyError(err)) {
        return res.status(409).json({ error: 'This person is already on the Atlas roster' })
      }
      next(err)
    }
  },
)

// GET /api/atlas/roster -> the whole roster, Person populated, creation order.
atlasRosterRouter.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const members = await AtlasRosterMember.find().populate('personId').sort({ createdAt: 1 })
    res.json(members)
  } catch (err) {
    next(err)
  }
})

// DELETE /api/atlas/roster/:id -> removes the roster entry only — the Person
// itself is never cascade-deleted (same posture as team-memberships.ts).
atlasRosterRouter.delete('/:id', async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
  try {
    const member = await AtlasRosterMember.findByIdAndDelete(req.params.id)

    if (!member) {
      return res.status(404).json({ error: 'Atlas roster entry not found' })
    }

    res.status(204).end()
  } catch (err) {
    next(err)
  }
})
