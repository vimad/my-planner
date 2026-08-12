import { Router, type NextFunction, type Request, type Response } from 'express'
import { PlaceholderTicket } from '../models/PlaceholderTicket.ts'

export const placeholderTicketsRouter = Router()

interface CreatePlaceholderBody {
  teamId?: string
  sprintId?: string
  personId?: string
  text?: string
  estimateHours?: number
}

// GET /api/placeholder-tickets?teamId=&sprintId= -> every placeholder ticket
// in a team's sprint plan, oldest first. No devQa/order/populate decoration
// like GET /api/sprint-plan-entries — a placeholder always has exactly one
// assignee and no drag-reorder (out of scope, see models/PlaceholderTicket.ts).
placeholderTicketsRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { teamId, sprintId } = req.query
    if (!teamId || typeof teamId !== 'string' || !sprintId || typeof sprintId !== 'string') {
      return res.status(400).json({ error: 'teamId and sprintId are required' })
    }

    const placeholders = await PlaceholderTicket.find({ teamId, sprintId }).sort({ createdAt: 1 })
    res.json(placeholders)
  } catch (err) {
    next(err)
  }
})

// POST /api/placeholder-tickets -> body { teamId, sprintId, personId, text,
// estimateHours }. Never touches Jira or the Ticket collection.
placeholderTicketsRouter.post(
  '/',
  async (req: Request<Record<string, never>, unknown, CreatePlaceholderBody>, res: Response, next: NextFunction) => {
    try {
      const { teamId, sprintId, personId, text, estimateHours } = req.body

      if (!teamId || !sprintId || !personId) {
        return res.status(400).json({ error: 'teamId, sprintId and personId are required' })
      }
      const trimmedText = text?.trim()
      if (!trimmedText) {
        return res.status(400).json({ error: 'text is required' })
      }
      if (typeof estimateHours !== 'number' || Number.isNaN(estimateHours) || estimateHours < 0) {
        return res.status(400).json({ error: 'estimateHours must be a non-negative number' })
      }

      const placeholder = await PlaceholderTicket.create({
        teamId,
        sprintId,
        personId,
        text: trimmedText,
        estimateHours,
      })
      res.status(201).json(placeholder)
    } catch (err) {
      next(err)
    }
  },
)

// DELETE /api/placeholder-tickets/:id -> removes one placeholder ticket.
placeholderTicketsRouter.delete('/:id', async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
  try {
    const placeholder = await PlaceholderTicket.findByIdAndDelete(req.params.id)
    if (!placeholder) {
      return res.status(404).json({ error: 'Placeholder ticket not found' })
    }
    res.status(204).end()
  } catch (err) {
    next(err)
  }
})
