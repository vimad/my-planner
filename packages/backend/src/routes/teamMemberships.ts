import { Router, type NextFunction, type Request, type Response } from 'express'
import { TeamMembership, type TeamMembershipDoc } from '../models/TeamMembership.ts'
import type { Role } from '../models/Role.ts'
import { ROLES } from '../models/Role.ts'
import { isDuplicateKeyError } from '../utils/mongoErrors.ts'

export const teamMembershipsRouter = Router()

// Request body shape for create/update — client-supplied and unvalidated, so
// fields are optional here even though the model requires most of them; the
// handlers below enforce presence before writing.
interface TeamMembershipBody {
  teamId?: string
  personId?: string
  role?: Role
  capacityPercentOverride?: number | null
}

function isValidRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as string[]).includes(value)
}

// POST /api/team-memberships -> create a membership. Rejects a duplicate
// (teamId, personId) pair with 409 rather than the generic 500 handler —
// enforced by the model's unique compound index.
teamMembershipsRouter.post(
  '/',
  async (req: Request<Record<string, never>, unknown, TeamMembershipBody>, res: Response, next: NextFunction) => {
    try {
      const { teamId, personId, role, capacityPercentOverride } = req.body

      if (!teamId || !personId || !isValidRole(role)) {
        return res.status(400).json({ error: 'teamId, personId and a valid role are required' })
      }

      const membership = await TeamMembership.create({
        teamId,
        personId,
        role,
        capacityPercentOverride: capacityPercentOverride ?? null,
      })
      res.status(201).json(membership)
    } catch (err) {
      if (isDuplicateKeyError(err)) {
        return res.status(409).json({ error: 'This person already has a membership on this team' })
      }
      next(err)
    }
  },
)

// GET /api/team-memberships?teamId=... -> a team's roster, Person populated.
teamMembershipsRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { teamId } = req.query

    if (!teamId || typeof teamId !== 'string') {
      return res.status(400).json({ error: 'teamId is required' })
    }

    const memberships = await TeamMembership.find({ teamId }).populate('personId').sort({ createdAt: 1 })
    res.json(memberships)
  } catch (err) {
    next(err)
  }
})

// PATCH /api/team-memberships/:id -> edit role and/or capacityPercentOverride.
// capacityPercentOverride is distinguished by presence in the body, not
// truthiness: an explicit `null` reverts to the role default, while an
// omitted field leaves the existing override untouched.
teamMembershipsRouter.patch(
  '/:id',
  async (req: Request<{ id: string }, unknown, TeamMembershipBody>, res: Response, next: NextFunction) => {
    try {
      const { role } = req.body

      if (role !== undefined && !isValidRole(role)) {
        return res.status(400).json({ error: 'role must be a valid Role' })
      }

      const update: Partial<TeamMembershipDoc> = {}
      if (role !== undefined) update.role = role
      if ('capacityPercentOverride' in req.body) {
        update.capacityPercentOverride = req.body.capacityPercentOverride ?? null
      }

      const membership = await TeamMembership.findByIdAndUpdate(req.params.id, update, { new: true }).populate(
        'personId',
      )

      if (!membership) {
        return res.status(404).json({ error: 'Team membership not found' })
      }

      res.json(membership)
    } catch (err) {
      next(err)
    }
  },
)

// DELETE /api/team-memberships/:id -> removes the membership only — Person
// and any of that person's SprintPlanEntry/Ticket data are untouched, since
// a person may belong to other teams.
teamMembershipsRouter.delete('/:id', async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
  try {
    const membership = await TeamMembership.findByIdAndDelete(req.params.id)

    if (!membership) {
      return res.status(404).json({ error: 'Team membership not found' })
    }

    res.status(204).end()
  } catch (err) {
    next(err)
  }
})
