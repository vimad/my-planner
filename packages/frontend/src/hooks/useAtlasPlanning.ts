import { useCallback, useEffect, useState } from 'react'
import type { AtlasPlanningEntry } from '../types'
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

export interface UseAtlasPlanningResult {
  entries: AtlasPlanningEntry[]
  loading: boolean
  error: string | null
  rescheduleError: string | null
  // Ticket 03's (.scratch/atlas-planning-tab) Gantt drag-to-reschedule
  // autosave - PATCHes just startDate/endDate. The only manual edit a
  // planning entry still supports: everything else (which ticket, whose row
  // it's on) is board-derived, written by the backend's
  // reconcilePlanningEntries, never by this hook.
  rescheduleTicket: (entryId: string, startDate: string, endDate: string) => Promise<void>
}

// Atlas Planning tab's own data hook (.scratch/atlas-planning-tab) - fetches/
// mutates AtlasPlanningEntry (`/api/atlas-planning-entries`) only.
// Deliberately independent of useAtlasEpics.ts (Board/Summary's own hook)
// and useSprintPlan.ts (Sprint Planning's people-wise hook) per the spec's
// module-boundary decision. The one shared piece of infrastructure this
// feature reuses - Atlas's roster - is fetched separately by whichever
// component composes this hook with useAtlasRoster.ts.
export function useAtlasPlanning(): UseAtlasPlanningResult {
  const [entries, setEntries] = useState<AtlasPlanningEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [rescheduleError, setRescheduleError] = useState<string | null>(null)

  useEffect(() => {
    let ignore = false

    async function load() {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(`${API_URL}/api/atlas-planning-entries`)
        if (!res.ok) throw new Error(await parseErrorMessage(res))
        let data: AtlasPlanningEntry[] = await res.json()

        // One-time initial load: if Planning has never been seeded from the
        // board yet, pull it in now (backend's reconcilePlanningEntries via
        // POST /sync) - to do vs. in-progress tickets already tracked on the
        // board, in-progress ordered first per person. A no-op request once
        // this has run at least once, since entries won't come back empty
        // again unless every synced ticket has since reached Done.
        if (data.length === 0) {
          const syncRes = await fetch(`${API_URL}/api/atlas-planning-entries/sync`, { method: 'POST' })
          if (!syncRes.ok) throw new Error(await parseErrorMessage(syncRes))
          data = await syncRes.json()
        }

        if (!ignore) setEntries(data)
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

  const rescheduleTicket = useCallback(async (entryId: string, startDate: string, endDate: string) => {
    setRescheduleError(null)
    try {
      const res = await fetch(`${API_URL}/api/atlas-planning-entries/${entryId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startDate, endDate }),
      })
      if (!res.ok) throw new Error(await parseErrorMessage(res))
      const updated: AtlasPlanningEntry = await res.json()
      setEntries((prev) => prev.map((e) => (getId(e) === entryId ? updated : e)))
    } catch (err) {
      setRescheduleError((err as Error).message)
      throw err
    }
  }, [])

  return {
    entries,
    loading,
    error,
    rescheduleError,
    rescheduleTicket,
  }
}
