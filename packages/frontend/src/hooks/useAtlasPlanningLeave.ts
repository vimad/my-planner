import { useCallback, useEffect, useState } from 'react'
import type { AtlasPlanningLeaveMark, AtlasPlanningLeavePortion } from '../types'
import { getId } from '../utils/getId'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4100'

async function parseErrorMessage(res: Response): Promise<string> {
  try {
    const data = await res.json()
    return data?.error ?? `Request failed with status ${res.status}`
  } catch {
    return `Request failed with status ${res.status}`
  }
}

export interface UseAtlasPlanningLeaveResult {
  leaveMarks: AtlasPlanningLeaveMark[]
  loading: boolean
  error: string | null
  cycling: boolean
  cycleError: string | null
  // Handles the leave grid's whole click-to-cycle interaction (none -> full
  // -> half -> none) for one cell in a single call - the grid doesn't need
  // to know create vs. update vs. delete, just "the mark that currently
  // sits at this cell". Looks up any existing mark for (rosterMemberId,
  // date) itself so the caller never has to pass an entry id.
  cycleLeave: (rosterMemberId: string, date: string) => Promise<void>
}

// none -> full -> half -> none, per cell click (same shape as Sprint
// Planning's SprintLeaveGrid, fresh implementation). Full day leads since
// it's the common case; half day is the secondary click.
function nextPortion(current: AtlasPlanningLeavePortion | undefined): AtlasPlanningLeavePortion | null {
  if (current === undefined) return 'full'
  if (current === 'full') return 'half'
  return null
}

// Atlas Planning tab's leave-mark hook (.scratch/atlas-planning-tab, ticket
// 02) - fetches/mutates AtlasPlanningLeave (`/api/atlas-planning-leave`)
// only. Deliberately independent of Sprint Planning's leave code
// (services/leaveEntries.ts, SprintLeaveGrid.tsx's onSetLeaveEntries) and of
// this feature's own useAtlasPlanning.ts (ticket 01's ticket-attachment
// hook) - a separate concern, separate module, per the spec's module-
// boundary decision. GET already returns only marks inside the current
// rolling window (read-time reconciliation on the backend), so every mark
// in `leaveMarks` is always safe to render.
export function useAtlasPlanningLeave(): UseAtlasPlanningLeaveResult {
  const [leaveMarks, setLeaveMarks] = useState<AtlasPlanningLeaveMark[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [cycling, setCycling] = useState(false)
  const [cycleError, setCycleError] = useState<string | null>(null)

  useEffect(() => {
    let ignore = false

    async function load() {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(`${API_URL}/api/atlas-planning-leave`)
        if (!res.ok) throw new Error(await parseErrorMessage(res))
        const data: AtlasPlanningLeaveMark[] = await res.json()
        if (!ignore) setLeaveMarks(data)
      } catch (err) {
        if (!ignore) setError((err as Error).message)
      } finally {
        if (!ignore) setLoading(false)
      }
    }

    load()

    return () => {
      ignore = true
    }
  }, [])

  const cycleLeave = useCallback(
    async (rosterMemberId: string, date: string) => {
      setCycling(true)
      setCycleError(null)
      try {
        const existing = leaveMarks.find((m) => m.rosterMemberId === rosterMemberId && m.date === date)
        const next = nextPortion(existing?.portion)

        if (existing && next === null) {
          const id = getId(existing)!
          const res = await fetch(`${API_URL}/api/atlas-planning-leave/${id}`, { method: 'DELETE' })
          if (!res.ok) throw new Error(await parseErrorMessage(res))
          setLeaveMarks((prev) => prev.filter((m) => getId(m) !== id))
          return
        }

        if (existing && next !== null) {
          const id = getId(existing)!
          const res = await fetch(`${API_URL}/api/atlas-planning-leave/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ portion: next }),
          })
          if (!res.ok) throw new Error(await parseErrorMessage(res))
          const updated: AtlasPlanningLeaveMark = await res.json()
          setLeaveMarks((prev) => prev.map((m) => (getId(m) === id ? updated : m)))
          return
        }

        // No existing mark - none -> full.
        const res = await fetch(`${API_URL}/api/atlas-planning-leave`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rosterMemberId, date, portion: next }),
        })
        if (!res.ok) throw new Error(await parseErrorMessage(res))
        const created: AtlasPlanningLeaveMark = await res.json()
        setLeaveMarks((prev) => [...prev, created])
      } catch (err) {
        setCycleError((err as Error).message)
        throw err
      } finally {
        setCycling(false)
      }
    },
    [leaveMarks],
  )

  return { leaveMarks, loading, error, cycling, cycleError, cycleLeave }
}
