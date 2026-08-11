import { Router, type NextFunction, type Request, type Response } from 'express'
import { Person, type PersonDoc } from '../models/Person.ts'
import { searchUsers } from '../services/jiraClient.ts'
import { isDuplicateKeyError } from '../utils/mongoErrors.ts'

export const peopleRouter = Router()

// Request body shape for create/update — client-supplied and unvalidated, so
// fields are optional here even though the model requires them; the
// handlers below enforce presence before writing.
interface PersonBody {
  name?: string
  email?: string
  jiraAccountId?: string
}

// POST /api/people -> create a person. jiraAccountId is the actual match key
// (ADR 0001) and is unique — a duplicate is a 409, not a 500.
peopleRouter.post(
  '/',
  async (req: Request<Record<string, never>, unknown, PersonBody>, res: Response, next: NextFunction) => {
    try {
      const { name, email, jiraAccountId } = req.body

      if (!name || !email || !jiraAccountId) {
        return res.status(400).json({ error: 'name, email and jiraAccountId are required' })
      }

      const person = await Person.create({ name, email, jiraAccountId })
      res.status(201).json(person)
    } catch (err) {
      if (isDuplicateKeyError(err)) {
        return res.status(409).json({ error: 'jiraAccountId is already mapped to a person' })
      }
      next(err)
    }
  },
)

// GET /api/people/jira-search?query=... -> passthrough to jiraClient.searchUsers,
// backing the manual-entry form's optional autocomplete (spec: "if ticket
// 11's live verification confirmed the 'Browse users and groups' permission
// is available..."). searchUsers itself returns null on a 403 rather than
// throwing, which this route surfaces as-is so the frontend can degrade to
// plain manual fields without treating it as an error.
peopleRouter.get('/jira-search', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { query } = req.query

    if (!query || typeof query !== 'string') {
      return res.status(400).json({ error: 'query is required' })
    }

    const users = await searchUsers(query)
    res.json(users)
  } catch (err) {
    next(err)
  }
})

// GET /api/people -> list all people, creation order.
peopleRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const people = await Person.find().sort({ createdAt: 1 })
    res.json(people)
  } catch (err) {
    next(err)
  }
})

// PATCH /api/people/:id -> edit name/email/jiraAccountId.
peopleRouter.patch(
  '/:id',
  async (req: Request<{ id: string }, unknown, PersonBody>, res: Response, next: NextFunction) => {
    try {
      const { name, email, jiraAccountId } = req.body
      const update: Partial<PersonDoc> = {}
      if (name !== undefined) update.name = name
      if (email !== undefined) update.email = email
      if (jiraAccountId !== undefined) update.jiraAccountId = jiraAccountId

      const person = await Person.findByIdAndUpdate(req.params.id, update, { returnDocument: 'after' })

      if (!person) {
        return res.status(404).json({ error: 'Person not found' })
      }

      res.json(person)
    } catch (err) {
      if (isDuplicateKeyError(err)) {
        return res.status(409).json({ error: 'jiraAccountId is already mapped to a person' })
      }
      next(err)
    }
  },
)

// DELETE /api/people/:id -> delete a person only. Any TeamMembership rows
// referencing them are left dangling by design (see teams.ts's equivalent
// no-cascade note) — cascade cleanup, if wanted, is later-ticket work.
peopleRouter.delete('/:id', async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
  try {
    const person = await Person.findByIdAndDelete(req.params.id)

    if (!person) {
      return res.status(404).json({ error: 'Person not found' })
    }

    res.status(204).end()
  } catch (err) {
    next(err)
  }
})
