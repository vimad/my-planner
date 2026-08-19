import { Router, type NextFunction, type Request, type Response } from 'express'
import { Standup, type StandupEntrySubdoc } from '../models/Standup.ts'
import { isDuplicateKeyError } from '../utils/mongoErrors.ts'

export const standupsRouter = Router()

interface StartStandupBody {
  teamId?: string
  date?: string
  teamMembershipIds?: string[]
}

interface TimerBody {
  teamMembershipId?: string
}

function isWellFormedIdArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.length > 0 && value.every((v) => typeof v === 'string' && v.length > 0)
}

// Same shape check as every other 'YYYY-MM-DD' field in this codebase (e.g.
// capacityEntries.ts's isWellFormedLeaveEntries) - doesn't verify the date
// is a real calendar date, just that it's shaped the way the rest of the
// app expects a local calendar-day string to look.
function isWellFormedDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
}

// Shared by timer/start and timer/stop - both need "this person's entry on
// this standup, or nothing".
function findEntry(entries: StandupEntrySubdoc[], teamMembershipId: string): StandupEntrySubdoc | undefined {
  return entries.find((e) => e.teamMembershipId.toString() === teamMembershipId)
}

// GET /api/standups?teamId=&date= -> the team's single standup record for
// that calendar day, or 404 if "Start standup" hasn't been clicked yet for
// this day — StatusView.tsx treats a 404 here as "show the Start standup
// button", not an error.
standupsRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { teamId, date } = req.query
    if (!teamId || typeof teamId !== 'string') {
      return res.status(400).json({ error: 'teamId and date are required' })
    }
    if (!isWellFormedDate(date)) {
      return res.status(400).json({ error: 'date must be a YYYY-MM-DD string' })
    }

    const standup = await Standup.findOne({ teamId, date })
    if (!standup) {
      return res.status(404).json({ error: 'No standup started for this day' })
    }
    res.json(standup)
  } catch (err) {
    next(err)
  }
})

// POST /api/standups -> starts today's standup, persisting the roster order
// the client already shuffled client-side (teamMembershipIds, in reading
// order). Idempotent by (teamId, date): a second call for the same day
// (e.g. a double-click, or two tabs racing) just returns the
// already-started record unchanged rather than erroring or re-shuffling.
standupsRouter.post(
  '/',
  async (req: Request<Record<string, never>, unknown, StartStandupBody>, res: Response, next: NextFunction) => {
    const { teamId, date, teamMembershipIds } = req.body
    try {
      if (!teamId) {
        return res.status(400).json({ error: 'teamId and date are required' })
      }
      if (!isWellFormedDate(date)) {
        return res.status(400).json({ error: 'date must be a YYYY-MM-DD string' })
      }
      if (!isWellFormedIdArray(teamMembershipIds)) {
        return res.status(400).json({ error: 'teamMembershipIds must be a non-empty array of ids' })
      }

      const existing = await Standup.findOne({ teamId, date })
      if (existing) {
        return res.json(existing)
      }

      const standup = await Standup.create({
        teamId,
        date,
        entries: teamMembershipIds.map((teamMembershipId) => ({
          teamMembershipId,
          totalSeconds: 0,
          activeStartedAt: null,
        })),
      })
      res.status(201).json(standup)
    } catch (err) {
      if (isDuplicateKeyError(err)) {
        const existing = await Standup.findOne({ teamId, date })
        if (existing) return res.json(existing)
      }
      next(err)
    }
  },
)

// POST /api/standups/:id/timer/start -> begins timing one person's turn.
// Rejects (400) if the standup already ended, if the person isn't on this
// standup's roster, if their own timer is already running, or if a
// *different* person's timer is currently running — StatusView only ever
// shows one person "on the clock" at a time, enforced here too so two
// browser tabs can't leave two timers running simultaneously.
standupsRouter.post(
  '/:id/timer/start',
  async (req: Request<{ id: string }, unknown, TimerBody>, res: Response, next: NextFunction) => {
    try {
      const { teamMembershipId } = req.body
      if (!teamMembershipId) {
        return res.status(400).json({ error: 'teamMembershipId is required' })
      }

      const standup = await Standup.findById(req.params.id)
      if (!standup) {
        return res.status(404).json({ error: 'Standup not found' })
      }
      if (standup.endedAt) {
        return res.status(400).json({ error: 'This standup has already ended' })
      }

      const entry = findEntry(standup.entries, teamMembershipId)
      if (!entry) {
        return res.status(400).json({ error: 'This person is not on today’s standup' })
      }
      if (entry.activeStartedAt) {
        return res.status(400).json({ error: 'Timer already running for this person' })
      }
      const someoneElseRunning = standup.entries.some((e) => e.activeStartedAt)
      if (someoneElseRunning) {
        return res.status(400).json({ error: 'Another person’s timer is already running' })
      }

      entry.activeStartedAt = new Date()
      await standup.save()
      res.json(standup)
    } catch (err) {
      next(err)
    }
  },
)

// POST /api/standups/:id/timer/stop -> ends that person's currently-running
// timer, folding the elapsed time into their persisted total.
standupsRouter.post(
  '/:id/timer/stop',
  async (req: Request<{ id: string }, unknown, TimerBody>, res: Response, next: NextFunction) => {
    try {
      const { teamMembershipId } = req.body
      if (!teamMembershipId) {
        return res.status(400).json({ error: 'teamMembershipId is required' })
      }

      const standup = await Standup.findById(req.params.id)
      if (!standup) {
        return res.status(404).json({ error: 'Standup not found' })
      }

      const entry = findEntry(standup.entries, teamMembershipId)
      if (!entry || !entry.activeStartedAt) {
        return res.status(400).json({ error: 'This person’s timer is not running' })
      }

      const elapsedSeconds = Math.max(0, Math.round((Date.now() - entry.activeStartedAt.getTime()) / 1000))
      entry.totalSeconds += elapsedSeconds
      entry.activeStartedAt = null
      await standup.save()
      res.json(standup)
    } catch (err) {
      next(err)
    }
  },
)

// POST /api/standups/:id/end -> closes out the day's standup. Any
// still-running timer is auto-stopped first (folded into that person's
// total) rather than left dangling with no way to ever stop it once the
// standup's marked ended.
standupsRouter.post('/:id/end', async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
  try {
    const standup = await Standup.findById(req.params.id)
    if (!standup) {
      return res.status(404).json({ error: 'Standup not found' })
    }
    if (standup.endedAt) {
      return res.status(400).json({ error: 'This standup has already ended' })
    }

    const now = Date.now()
    for (const entry of standup.entries) {
      if (entry.activeStartedAt) {
        entry.totalSeconds += Math.max(0, Math.round((now - entry.activeStartedAt.getTime()) / 1000))
        entry.activeStartedAt = null
      }
    }
    standup.endedAt = new Date()
    await standup.save()
    res.json(standup)
  } catch (err) {
    next(err)
  }
})
